import "dotenv/config";
import { initializeApp as initAdminApp, cert as adminCert, getApps as getAdminApps } from "firebase-admin/app";
import { getFirestore as getAdminFirestore, FieldValue as AdminFieldValue, Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import { initializeApp as initClientApp, getApps as getClientApps } from "firebase/app";
import {
  getFirestore as getClientFirestore,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  runTransaction,
  query,
  where,
  Timestamp as ClientTimestamp,
  serverTimestamp as clientServerTimestamp,
  setDoc,
} from "firebase/firestore";
import { sendAttendanceEmail } from "./emailService.js";

// Configuration from environment variables
const IS_TEST_MODE = process.env.TEST_MODE === "true";
const TWENTY_DAYS_MS = 20 * 24 * 60 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;
const CYCLE_DURATION_MS = IS_TEST_MODE ? ONE_MINUTE_MS : TWENTY_DAYS_MS;
const STALE_LOCK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Initializes and returns the Firebase Admin Firestore instance.
 * Required in production (TEST_MODE=false).
 */
function getAdminFirestoreInstance() {
  if (getAdminApps().length === 0) {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const projectId = process.env.FIREBASE_PROJECT_ID || "attendancealert-869ad";

    if (!serviceAccountKey) {
      if (!IS_TEST_MODE) {
        throw new Error(
          "[CRON] Fatal: FIREBASE_SERVICE_ACCOUNT_KEY environment variable is required in production environment."
        );
      }
      console.warn("[CRON] Warning: FIREBASE_SERVICE_ACCOUNT_KEY missing in local TEST_MODE.");
    }

    if (serviceAccountKey) {
      try {
        const serviceAccount = JSON.parse(serviceAccountKey);
        initAdminApp({
          credential: adminCert(serviceAccount),
          projectId: serviceAccount.project_id || projectId,
        });
      } catch (err) {
        throw new Error(`[CRON] Fatal: Invalid FIREBASE_SERVICE_ACCOUNT_KEY JSON format: ${err.message}`);
      }
    } else {
      // Local dev/testing fallback
      initAdminApp({ projectId });
    }
  }

  return getAdminFirestore();
}

/**
 * Backend Node Client SDK fallback ONLY when Admin credentials are missing in local dev/testing.
 */
function getBackendClientFirestore() {
  if (getClientApps().length === 0) {
    const firebaseConfig = {
      apiKey: process.env.VITE_FIREBASE_API_KEY,
      authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "attendancealert-869ad",
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.VITE_FIREBASE_APP_ID,
      measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID,
    };
    initClientApp(firebaseConfig);
  }
  return getClientFirestore();
}

/**
 * Helper to convert Firestore Timestamp / Date / ISO string / millis into epoch ms.
 */
function toEpochMs(val) {
  if (!val) return null;
  if (typeof val.toMillis === "function") return val.toMillis();
  if (typeof val.toDate === "function") return val.toDate().getTime();
  if (val instanceof Date) return val.getTime();
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const parsed = Date.parse(val);
    if (!isNaN(parsed)) return parsed;
  }
  return null;
}

/**
 * Queries all student documents from Firestore securely.
 */
async function fetchStudentDocuments() {
  try {
    const adminDb = getAdminFirestoreInstance();
    const snapshot = await adminDb.collection("students").get();
    return snapshot.docs.map((d) => ({ id: d.id, data: d.data() }));
  } catch (adminErr) {
    if (!IS_TEST_MODE) throw adminErr;
    console.log("[CRON] Firebase Admin fallback to Client SDK for student fetch...");
    const clientDb = getBackendClientFirestore();
    const snapshot = await getDocs(collection(clientDb, "students"));
    return snapshot.docs.map((d) => ({ id: d.id, data: d.data() }));
  }
}

/**
 * Fetches student IDs who already received a successful notification for the given cycle ID.
 */
async function fetchSentStudentIdsForCycle(cycleId) {
  const sentStudentIds = new Set();
  try {
    const adminDb = getAdminFirestoreInstance();
    const snapshot = await adminDb
      .collection("Notifications")
      .where("cycleId", "==", cycleId)
      .where("status", "==", "sent")
      .get();

    snapshot.docs.forEach((d) => {
      const data = d.data();
      if (data.stud_id) {
        sentStudentIds.add(data.stud_id);
      }
    });
  } catch (adminErr) {
    if (!IS_TEST_MODE) throw adminErr;
    try {
      const clientDb = getBackendClientFirestore();
      const q = query(
        collection(clientDb, "Notifications"),
        where("cycleId", "==", cycleId),
        where("status", "==", "sent")
      );
      const snapshot = await getDocs(q);
      snapshot.docs.forEach((d) => {
        const data = d.data();
        if (data.stud_id) {
          sentStudentIds.add(data.stud_id);
        }
      });
    } catch (clientErr) {
      console.warn("[CRON] Warning: Could not fetch existing cycle notifications:", clientErr.message);
    }
  }
  return sentStudentIds;
}

/**
 * Creates a Notification document in Firestore and returns an updater interface.
 */
async function createNotificationRecord(notifData) {
  try {
    const adminDb = getAdminFirestoreInstance();
    const notifRef = adminDb.collection("Notifications").doc();
    await notifRef.set({
      ...notifData,
      timestamp: AdminFieldValue.serverTimestamp(),
    });

    return {
      id: notifRef.id,
      updateStatus: async (status, extra = {}) => {
        const payload = { status, ...extra };
        if (status === "sent") {
          payload.sentAt = AdminFieldValue.serverTimestamp();
        }
        await notifRef.update(payload);
      },
    };
  } catch (adminErr) {
    if (!IS_TEST_MODE) throw adminErr;
    const clientDb = getBackendClientFirestore();
    const docRef = await addDoc(collection(clientDb, "Notifications"), {
      ...notifData,
      timestamp: clientServerTimestamp(),
    });

    return {
      id: docRef.id,
      updateStatus: async (status, extra = {}) => {
        const payload = { status, ...extra };
        if (status === "sent") {
          payload.sentAt = clientServerTimestamp();
        }
        await updateDoc(doc(clientDb, "Notifications", docRef.id), payload);
      },
    };
  }
}

/**
 * Attempts to read state, verify cycle due status, and acquire execution lock in Firestore (System/attendanceCron).
 */
async function tryAcquireCronLock() {
  const nowMs = Date.now();

  try {
    const adminDb = getAdminFirestoreInstance();
    const docRef = adminDb.collection("System").doc("attendanceCron");

    return await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(docRef);

      if (!snap.exists) {
        const initialNextMs = nowMs + CYCLE_DURATION_MS;
        const initialCycleId = `cycle_${initialNextMs}`;
        const initialState = {
          lastExecutedAt: null,
          nextNotificationAt: AdminTimestamp.fromMillis(initialNextMs),
          currentCycleId: initialCycleId,
          isRunning: false,
          lockAcquiredAt: null,
          mode: IS_TEST_MODE ? "TEST" : "PRODUCTION",
        };

        transaction.set(docRef, initialState);
        console.log("[CRON] Created initial System/attendanceCron state document in Firestore.");

        return {
          status: "NOT_DUE",
          state: {
            lastExecutedAt: null,
            nextNotificationAt: initialNextMs,
            currentCycleId: initialCycleId,
            isRunning: false,
            lockAcquiredAt: null,
            mode: initialState.mode,
          },
        };
      }

      const data = snap.data();
      const lastExecMs = toEpochMs(data.lastExecutedAt);
      const nextNotifMs = toEpochMs(data.nextNotificationAt) || nowMs;
      const lockAcquiredMs = toEpochMs(data.lockAcquiredAt);
      const isRunning = Boolean(data.isRunning);
      const cycleId = data.currentCycleId || `cycle_${nextNotifMs}`;

      const isDue = nowMs >= nextNotifMs;

      if (!isDue) {
        return {
          status: "NOT_DUE",
          state: {
            lastExecutedAt: lastExecMs,
            nextNotificationAt: nextNotifMs,
            currentCycleId: cycleId,
            isRunning,
            lockAcquiredAt: lockAcquiredMs,
            mode: data.mode || (IS_TEST_MODE ? "TEST" : "PRODUCTION"),
          },
        };
      }

      // Cycle IS due. Check concurrency lock.
      if (isRunning) {
        const lockAge = lockAcquiredMs ? nowMs - lockAcquiredMs : Infinity;
        if (lockAge < STALE_LOCK_TIMEOUT_MS) {
          return {
            status: "LOCKED",
            state: {
              lastExecutedAt: lastExecMs,
              nextNotificationAt: nextNotifMs,
              currentCycleId: cycleId,
              isRunning: true,
              lockAcquiredAt: lockAcquiredMs,
              mode: data.mode,
            },
          };
        }
        console.warn(`[CRON] Found stale lock acquired ${Math.round(lockAge / 60000)} minutes ago. Overriding lock...`);
      }

      // Acquire lock atomically
      transaction.update(docRef, {
        isRunning: true,
        lockAcquiredAt: AdminTimestamp.fromMillis(nowMs),
        currentCycleId: cycleId,
        mode: IS_TEST_MODE ? "TEST" : "PRODUCTION",
      });

      return {
        status: "DUE_AND_LOCKED",
        state: {
          lastExecutedAt: lastExecMs,
          nextNotificationAt: nextNotifMs,
          currentCycleId: cycleId,
          isRunning: true,
          lockAcquiredAt: nowMs,
          mode: IS_TEST_MODE ? "TEST" : "PRODUCTION",
        },
      };
    });
  } catch (adminErr) {
    if (!IS_TEST_MODE) throw adminErr;
    console.log("[CRON] Firebase Admin transaction fallback to Client SDK...");
    const clientDb = getBackendClientFirestore();

    return await runTransaction(clientDb, async (transaction) => {
      const docRef = doc(clientDb, "System", "attendanceCron");
      const snap = await transaction.get(docRef);

      if (!snap.exists()) {
        const initialNextMs = nowMs + CYCLE_DURATION_MS;
        const initialCycleId = `cycle_${initialNextMs}`;
        const initialState = {
          lastExecutedAt: null,
          nextNotificationAt: ClientTimestamp.fromMillis(initialNextMs),
          currentCycleId: initialCycleId,
          isRunning: false,
          lockAcquiredAt: null,
          mode: IS_TEST_MODE ? "TEST" : "PRODUCTION",
        };

        transaction.set(docRef, initialState);
        console.log("[CRON] Created initial System/attendanceCron state document in Firestore.");

        return {
          status: "NOT_DUE",
          state: {
            lastExecutedAt: null,
            nextNotificationAt: initialNextMs,
            currentCycleId: initialCycleId,
            isRunning: false,
            lockAcquiredAt: null,
            mode: initialState.mode,
          },
        };
      }

      const data = snap.data();
      const lastExecMs = toEpochMs(data.lastExecutedAt);
      const nextNotifMs = toEpochMs(data.nextNotificationAt) || nowMs;
      const lockAcquiredMs = toEpochMs(data.lockAcquiredAt);
      const isRunning = Boolean(data.isRunning);
      const cycleId = data.currentCycleId || `cycle_${nextNotifMs}`;

      const isDue = nowMs >= nextNotifMs;

      if (!isDue) {
        return {
          status: "NOT_DUE",
          state: {
            lastExecutedAt: lastExecMs,
            nextNotificationAt: nextNotifMs,
            currentCycleId: cycleId,
            isRunning,
            lockAcquiredAt: lockAcquiredMs,
            mode: data.mode || (IS_TEST_MODE ? "TEST" : "PRODUCTION"),
          },
        };
      }

      if (isRunning) {
        const lockAge = lockAcquiredMs ? nowMs - lockAcquiredMs : Infinity;
        if (lockAge < STALE_LOCK_TIMEOUT_MS) {
          return {
            status: "LOCKED",
            state: {
              lastExecutedAt: lastExecMs,
              nextNotificationAt: nextNotifMs,
              currentCycleId: cycleId,
              isRunning: true,
              lockAcquiredAt: lockAcquiredMs,
              mode: data.mode,
            },
          };
        }
        console.warn(`[CRON] Found stale lock acquired ${Math.round(lockAge / 60000)} minutes ago. Overriding lock...`);
      }

      transaction.update(docRef, {
        isRunning: true,
        lockAcquiredAt: ClientTimestamp.fromMillis(nowMs),
        currentCycleId: cycleId,
        mode: IS_TEST_MODE ? "TEST" : "PRODUCTION",
      });

      return {
        status: "DUE_AND_LOCKED",
        state: {
          lastExecutedAt: lastExecMs,
          nextNotificationAt: nextNotifMs,
          currentCycleId: cycleId,
          isRunning: true,
          lockAcquiredAt: nowMs,
          mode: IS_TEST_MODE ? "TEST" : "PRODUCTION",
        },
      };
    });
  }
}

/**
 * Updates scheduler state after job completion or releases the lock on failure.
 * Advances next 20-day cycle ONLY if failedCount === 0.
 */
async function releaseLockAndUpdateState(jobResults, completionMs = Date.now(), currentCycleId = "") {
  const { failedCount = 0 } = jobResults || {};
  const isFullySuccessful = jobResults && failedCount === 0;

  const nextNotifMs = completionMs + CYCLE_DURATION_MS;
  const newCycleId = `cycle_${nextNotifMs}`;

  try {
    const adminDb = getAdminFirestoreInstance();
    const docRef = adminDb.collection("System").doc("attendanceCron");

    if (isFullySuccessful) {
      const updatePayload = {
        lastExecutedAt: AdminTimestamp.fromMillis(completionMs),
        nextNotificationAt: AdminTimestamp.fromMillis(nextNotifMs),
        currentCycleId: newCycleId,
        isRunning: false,
        lockAcquiredAt: null,
        mode: IS_TEST_MODE ? "TEST" : "PRODUCTION",
      };
      await docRef.set(updatePayload, { merge: true });
      console.log(`[CRON] Cycle completed with 0 failures.`);
      console.log(`[CRON] Next notification cycle: ${new Date(nextNotifMs).toISOString()}`);
    } else {
      await docRef.set(
        {
          isRunning: false,
          lockAcquiredAt: null,
        },
        { merge: true }
      );
      console.log(`[CRON] Job completed with ${failedCount} failure(s). Lock released. Cycle ${currentCycleId} will retry remaining failed emails on next invocation.`);
    }
  } catch (adminErr) {
    if (!IS_TEST_MODE) throw adminErr;
    try {
      const clientDb = getBackendClientFirestore();
      const docRef = doc(clientDb, "System", "attendanceCron");
      if (isFullySuccessful) {
        await setDoc(
          docRef,
          {
            lastExecutedAt: ClientTimestamp.fromMillis(completionMs),
            nextNotificationAt: ClientTimestamp.fromMillis(nextNotifMs),
            currentCycleId: newCycleId,
            isRunning: false,
            lockAcquiredAt: null,
            mode: IS_TEST_MODE ? "TEST" : "PRODUCTION",
          },
          { merge: true }
        );
        console.log(`[CRON] Cycle completed with 0 failures.`);
        console.log(`[CRON] Next notification cycle: ${new Date(nextNotifMs).toISOString()}`);
      } else {
        await setDoc(
          docRef,
          {
            isRunning: false,
            lockAcquiredAt: null,
          },
          { merge: true }
        );
        console.log(`[CRON] Job completed with ${failedCount} failure(s). Lock released. Cycle ${currentCycleId} will retry remaining failed emails on next invocation.`);
      }
    } catch (clientErr) {
      console.error("[CRON] Failed to update state in Firestore:", clientErr.message || clientErr);
    }
  }
}

/**
 * Core attendance notification job.
 * Fetches students from Firestore, evaluates subject-wise low attendance (< 75%),
 * dispatches warning email alerts via emailService.js, and logs to Notifications collection.
 *
 * @returns {Promise<{ sentCount: number, failedCount: number, eligibleCount: number }>}
 */
export async function runAttendanceNotificationJob(cycleId) {
  const studentDocs = await fetchStudentDocuments();
  console.log(`[CRON] Students found: ${studentDocs.length}`);

  const eligibleStudents = [];

  studentDocs.forEach(({ id, data }) => {
    const studentName = data.name || "Unknown Student";
    const parentName = data.parentName || "Parent/Guardian";
    const parentEmail = data.parentEmail || data.parent_email || data.parentMail || "";
    const parentPhone = data.parentphone || data.parentPhone || "Not available";
    const subjects = data.subjects || {};

    const lowSubjects = [];

    Object.entries(subjects).forEach(([subjectName, score]) => {
      const numScore = Number(score);
      if (!isNaN(numScore) && numScore < 75) {
        lowSubjects.push({
          subject: subjectName,
          attendance: numScore,
        });
      }
    });

    const overallAttendance = Number(data.attendance ?? 100);
    if (lowSubjects.length === 0 && overallAttendance < 75) {
      lowSubjects.push({
        subject: "Overall Attendance",
        attendance: overallAttendance,
      });
    }

    if (lowSubjects.length > 0 && parentEmail) {
      eligibleStudents.push({
        docId: id,
        name: studentName,
        parentName,
        parentPhone,
        parentEmail,
        lowSubjects,
      });
    }
  });

  console.log(`[CRON] Students requiring attendance alerts: ${eligibleStudents.length}`);

  // Fetch student IDs already notified in the current cycle
  const alreadySentStudentIds = await fetchSentStudentIdsForCycle(cycleId);
  if (alreadySentStudentIds.size > 0) {
    console.log(`[CRON] Found ${alreadySentStudentIds.size} student(s) already notified in cycle '${cycleId}'. Skipping duplicate sends.`);
  }

  const rawLimit = process.env.TEST_SEND_LIMIT;
  const sendLimit = IS_TEST_MODE && rawLimit ? parseInt(rawLimit, 10) : eligibleStudents.length;
  const studentsToProcess = eligibleStudents.slice(0, sendLimit);

  const processedStudentIds = new Set();
  let sentCount = 0;
  let failedCount = 0;

  for (const student of studentsToProcess) {
    if (processedStudentIds.has(student.docId)) {
      continue;
    }
    processedStudentIds.add(student.docId);

    if (alreadySentStudentIds.has(student.docId)) {
      console.log(`[CRON] Skipping ${student.name} - already successfully notified for cycle '${cycleId}'`);
      continue;
    }

    console.log(`[CRON] Sending notification for: ${student.name}`);

    const notifRecord = await createNotificationRecord({
      stud_id: student.docId,
      studentName: student.name,
      parentPhone: student.parentPhone,
      flaggedSubjects: student.lowSubjects,
      status: "pending",
      subject: "Low attendance alert",
      cycleId: cycleId,
    });

    try {
      await sendAttendanceEmail({
        to: student.parentEmail,
        studentName: student.name,
        subjects: student.lowSubjects,
      });

      await notifRecord.updateStatus("sent");
      sentCount++;
      console.log(`[CRON] Notification sent successfully for: ${student.name}`);
    } catch (sendError) {
      failedCount++;
      console.error(`[CRON] Notification failed for: ${student.name}`, sendError.message || sendError);

      try {
        await notifRecord.updateStatus("failed", {
          error: String(sendError.message || sendError),
        });
      } catch (err) {
        // ignore secondary error
      }
    }
  }

  console.log(`[CRON] Execution Summary: ${sentCount} sent, ${failedCount} failed`);

  return {
    sentCount,
    failedCount,
    eligibleCount: eligibleStudents.length,
  };
}

/**
 * Main execution entry point for Render Cron Job.
 */
async function main() {
  const modeName = IS_TEST_MODE ? "TEST" : "PRODUCTION";
  console.log("[CRON] ==========================================");
  console.log("[CRON] Attendance Notification Job");
  console.log(`[CRON] Mode: ${modeName}`);
  console.log("[CRON] ==========================================");

  console.log("[CRON] Checking 20-day notification cycle");

  let lockAcquired = false;
  let currentCycleId = "";

  try {
    const lockResult = await tryAcquireCronLock();

    const lastExecStr = lockResult.state.lastExecutedAt
      ? new Date(lockResult.state.lastExecutedAt).toISOString()
      : "None";
    const nextNotifStr = lockResult.state.nextNotificationAt
      ? new Date(lockResult.state.nextNotificationAt).toISOString()
      : "Not set";

    currentCycleId = lockResult.state.currentCycleId || `cycle_${lockResult.state.nextNotificationAt}`;

    console.log(`[CRON] Last execution: ${lastExecStr}`);
    console.log(`[CRON] Next notification: ${nextNotifStr}`);
    console.log(`[CRON] Cycle Identifier: ${currentCycleId}`);

    if (lockResult.status === "NOT_DUE") {
      console.log("[CRON] Cycle due: false");
      console.log("[CRON] 20-day notification cycle is not due.");
      console.log("[CRON] Job completed");
      process.exitCode = 0;
      return;
    }

    if (lockResult.status === "LOCKED") {
      console.log("[CRON] Cycle due: true");
      console.log("[CRON] Job is already running in another process.");
      console.log("[CRON] Job completed");
      process.exitCode = 0;
      return;
    }

    console.log("[CRON] Cycle due: true");
    lockAcquired = true;

    const jobResults = await runAttendanceNotificationJob(currentCycleId);
    console.log(
      `[CRON] Notification Results: ${jobResults.eligibleCount} eligible, ${jobResults.sentCount} sent, ${jobResults.failedCount} failed`
    );

    const completionMs = Date.now();
    await releaseLockAndUpdateState(jobResults, completionMs, currentCycleId);
    console.log("[CRON] Job completed");
    process.exitCode = 0;
  } catch (error) {
    console.error("[CRON] Fatal error:", error.message || error);
    if (lockAcquired) {
      try {
        await releaseLockAndUpdateState({ failedCount: 1 }, Date.now(), currentCycleId);
      } catch (unlockErr) {
        console.error("[CRON] Error releasing lock after failure:", unlockErr.message || unlockErr);
      }
    }
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("[CRON] Uncaught fatal error:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(process.exitCode ?? 0);
  });
