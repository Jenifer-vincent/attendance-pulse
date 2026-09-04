import cron from "node-cron";
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp as initAdminApp, cert as adminCert, getApps as getAdminApps } from "firebase-admin/app";
import { getFirestore as getAdminFirestore, FieldValue as AdminFieldValue } from "firebase-admin/firestore";
import { initializeApp as initClientApp, getApps as getClientApps } from "firebase/app";
import {
  getFirestore as getClientFirestore,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp as clientServerTimestamp,
} from "firebase/firestore";
import { sendAttendanceEmail } from "./emailService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path for storing persisted cron schedule state
const STATE_FILE_PATH = path.join(__dirname, "cronState.json");

// Configuration from environment variables
const IS_TEST_MODE = process.env.TEST_MODE === "true";
const CRON_SCHEDULE = IS_TEST_MODE
  ? process.env.CRON_SCHEDULE_TEST || "*/1 * * * *"
  : process.env.CRON_SCHEDULE_PROD || "0 * * * *";

const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;

/**
 * Initializes and returns the Firebase Admin Firestore instance.
 * Uses environment credentials safely without exposing to frontend.
 */
function getAdminFirestoreInstance() {
  if (getAdminApps().length === 0) {
    const projectId =
      process.env.FIREBASE_PROJECT_ID ||
      process.env.VITE_FIREBASE_PROJECT_ID ||
      "attendancealert-869ad";

    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        initAdminApp({
          credential: adminCert(serviceAccount),
          projectId,
        });
      } catch (err) {
        console.warn("[CRON] Could not parse FIREBASE_SERVICE_ACCOUNT_KEY, using default config:", err.message);
        initAdminApp({ projectId });
      }
    } else {
      initAdminApp({ projectId });
    }
  }

  return getAdminFirestore();
}

/**
 * Backend Node Client SDK fallback when Admin credentials are not set locally.
 */
function getBackendClientFirestore() {
  if (getClientApps().length === 0) {
    const firebaseConfig = {
      apiKey: process.env.VITE_FIREBASE_API_KEY,
      authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.VITE_FIREBASE_PROJECT_ID || "attendancealert-869ad",
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
 * Queries all student documents from Firestore securely.
 */
async function fetchStudentDocuments() {
  try {
    const adminDb = getAdminFirestoreInstance();
    const snapshot = await adminDb.collection("students").get();
    return snapshot.docs.map((d) => ({ id: d.id, data: d.data() }));
  } catch (adminErr) {
    console.log("[CRON] Firebase Admin credentials not set locally, using backend Node fallback...");
    const clientDb = getBackendClientFirestore();
    const snapshot = await getDocs(collection(clientDb, "students"));
    return snapshot.docs.map((d) => ({ id: d.id, data: d.data() }));
  }
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
 * Reads persistent cron state from disk.
 */
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const data = fs.readFileSync(STATE_FILE_PATH, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("[CRON] Error reading state file, re-initializing:", error.message);
  }

  const now = Date.now();
  const nextNotificationAt = IS_TEST_MODE ? now : now + FIFTEEN_DAYS_MS;

  const initialState = {
    nextNotificationAt,
    lastExecutedAt: null,
    isRunning: false,
    mode: IS_TEST_MODE ? "TEST" : "PRODUCTION",
  };

  saveState(initialState);
  return initialState;
}

/**
 * Persists current cron state to disk.
 */
function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), "utf-8");
  } catch (error) {
    console.error("[CRON] Error writing state file:", error.message);
  }
}

/**
 * Core attendance notification job.
 * Fetches students from Firestore, evaluates subject-wise low attendance (< 75%),
 * dispatches warning email alerts via emailService.js, and logs to Notifications collection.
 */
export async function runAttendanceNotificationJob() {
  console.log("Cron started");
  console.log("Attendance notification job running");
  console.log("Checking students with attendance below 75%");
  console.log("[CRON] Fetching students from Firestore...");

  const testEmail = process.env.TEST_NOTIFICATION_EMAIL;

  if (!testEmail) {
    const errorMsg = "TEST_NOTIFICATION_EMAIL is not defined in environment variables";
    console.error(`[CRON] Attendance notification job failed: ${errorMsg}`);
    throw new Error(errorMsg);
  }

  const studentDocs = await fetchStudentDocuments();
  console.log(`[CRON] Students found: ${studentDocs.length}`);

  const eligibleStudents = [];

  studentDocs.forEach(({ id, data }) => {
    const studentName = data.name || "Unknown Student";
    const parentName = data.parentName || "Parent/Guardian";
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

    if (lowSubjects.length > 0) {
      eligibleStudents.push({
        docId: id,
        name: studentName,
        parentName,
        parentPhone,
        lowSubjects,
      });
    }
  });

  console.log(`[CRON] Students requiring attendance alerts: ${eligibleStudents.length}`);

  // Safe TEST_SEND_LIMIT environment variable check
  const rawLimit = process.env.TEST_SEND_LIMIT;
  const sendLimit = IS_TEST_MODE && rawLimit ? parseInt(rawLimit, 10) : eligibleStudents.length;

  const studentsToProcess = eligibleStudents.slice(0, sendLimit);

  // Duplicate protection set for single execution loop
  const processedStudentIds = new Set();
  let sentCount = 0;
  let failedCount = 0;

  for (const student of studentsToProcess) {
    if (processedStudentIds.has(student.docId)) {
      continue;
    }
    processedStudentIds.add(student.docId);

    console.log(`[CRON] Sending notification for: ${student.name}`);

    // Create notification document in pending status
    const notifRecord = await createNotificationRecord({
      stud_id: student.docId,
      studentName: student.name,
      parentPhone: student.parentPhone,
      flaggedSubjects: student.lowSubjects,
      status: "pending",
      subject: "Low attendance alert",
    });

    try {
      // Send email alert via emailService.js
      await sendAttendanceEmail({
        to: testEmail,
        studentName: student.name,
        subjects: student.lowSubjects,
      });

      // Update notification status to "sent"
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
  console.log("[CRON] Attendance notification job completed");
  console.log("Job completed");
}

/**
 * Evaluation loop executed on each cron tick to verify if 15-day cycle is due.
 */
async function checkAndExecuteScheduler() {
  const state = loadState();
  const now = Date.now();

  // Duplicate protection lock: ensure concurrent ticks or backend restarts do not run twice
  if (state.isRunning) {
    console.log("[CRON] Job is already running. Skipping execution tick.");
    return;
  }

  if (now >= state.nextNotificationAt) {
    console.log(
      `[CRON] Notification cycle due (Current: ${new Date(now).toISOString()}, Scheduled: ${new Date(state.nextNotificationAt).toISOString()})`
    );

    // Acquire execution lock
    state.isRunning = true;
    saveState(state);

    let jobSucceeded = false;

    try {
      await runAttendanceNotificationJob();
      jobSucceeded = true;
    } catch (error) {
      console.error("[CRON] Error executing attendance notification job:", error.message || error);
    } finally {
      const completionTime = Date.now();
      const nextInterval = IS_TEST_MODE ? ONE_MINUTE_MS : FIFTEEN_DAYS_MS;

      const updatedState = { ...state, isRunning: false };

      if (jobSucceeded) {
        updatedState.nextNotificationAt = completionTime + nextInterval;
        updatedState.lastExecutedAt = new Date(completionTime).toISOString();
        updatedState.mode = IS_TEST_MODE ? "TEST" : "PRODUCTION";
        saveState(updatedState);
        console.log(
          `[CRON] Next notification cycle scheduled for: ${new Date(updatedState.nextNotificationAt).toISOString()}`
        );
      } else {
        saveState(updatedState);
        console.log(
          `[CRON] Notification job failed. Next retry will occur on next scheduler check.`
        );
      }
    }
  } else {
    const timeRemainingSeconds = Math.round((state.nextNotificationAt - now) / 1000);
    console.log(
      `[CRON] Check complete. Next job due in ${timeRemainingSeconds} seconds (${new Date(state.nextNotificationAt).toISOString()})`
    );
  }
}

/**
 * Initializes and starts the background node-cron scheduler.
 */
function startCronScheduler() {
  console.log("==========================================");
  console.log("  Attendance Notification Cron Scheduler  ");
  console.log("==========================================");
  console.log(` Mode: ${IS_TEST_MODE ? "TEST MODE (1 minute check/interval)" : "PRODUCTION (Hourly check, 15-day interval)"}`);
  console.log(` Cron Schedule Pattern: "${CRON_SCHEDULE}"`);
  console.log("==========================================");

  // Run initial check on startup
  checkAndExecuteScheduler();

  // Schedule periodic tick checks
  cron.schedule(CRON_SCHEDULE, () => {
    checkAndExecuteScheduler();
  });
}

// Start scheduler if executed directly with Node.js
startCronScheduler();
