import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useEffect, useState } from "react";
import { Send, RotateCw, Inbox } from "lucide-react";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  setDoc,
  serverTimestamp,
  addDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { extractSubjectsAndAttendance, validateParentEmail } from "./preview";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Parent notifications — AttendPulse" },
      {
        name: "description",
        content: "Manage pending, sent, and failed email alerts to parents.",
      },
      { property: "og:title", content: "Parent notifications — AttendPulse" },
      {
        property: "og:description",
        content: "Manage pending, sent, and failed email alerts to parents.",
      },
    ],
  }),
  component: NotifPage,
});

const tabs = ["pending", "sent", "failed"] as const;
type Tab = (typeof tabs)[number];

function NotifPage() {
  const [tab, setTab] = useState<Tab>("pending");
  const [confirm, setConfirm] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [sending, setSending] = useState(false);

  const counts = {
    pending: notifications.filter((n) => n.status === "pending").length,
    sent: notifications.filter((n) => n.status === "sent").length,
    failed: notifications.filter((n) => n.status === "failed").length,
  };

  const fetchNotifications = async () => {
    try {
      // 1. Get all students and deduplicate by registerNo
      const studentSnapshot = await getDocs(collection(db, "students"));
      const studentMap = new Map<string, any>();

      studentSnapshot.docs.forEach((studentDoc) => {
        const data = studentDoc.data();
        const regNo = String(data.registerNo ?? data.register_no ?? studentDoc.id).trim().toUpperCase();
        if (!studentMap.has(regNo)) {
          const { subjects, overall } = extractSubjectsAndAttendance(data);
          const lowSubjects = Object.entries(subjects)
            .filter(([_, score]) => Number(score) < 75)
            .map(([subject, score]) => ({ subject, attendance: Number(score) }));

          studentMap.set(regNo, {
            id: studentDoc.id,
            registerNo: regNo,
            ...data,
            subjects,
            attendance: Number(data.attendance ?? overall),
            flaggedSubjects: lowSubjects,
          });
        }
      });

      // 2. Get existing notifications
      const notificationSnapshot = await getDocs(collection(db, "Notifications"));
      const notifMap = new Map<string, any>();

      notificationSnapshot.docs.forEach((d) => {
        const data = d.data();
        const studId = data.stud_id || data.registerNo || d.id;
        const regNo = String(data.registerNo ?? studId).trim().toUpperCase();

        if (!notifMap.has(regNo)) {
          notifMap.set(regNo, {
            id: d.id,
            stud_id: studId,
            ...data,
          });
        }
      });

      // 3. Create missing pending notifications for flagged students
      const finalNotifs: any[] = [];

      for (const [regNo, student] of studentMap.entries()) {
        const isLow = student.attendance < 75 || student.flaggedSubjects.length > 0;
        if (!isLow) continue;

        if (notifMap.has(regNo)) {
          const existing = notifMap.get(regNo);
          finalNotifs.push({
            ...existing,
            studentName: student.name ?? "Unknown student",
            parentEmail: student.parentEmail ?? existing.parentEmail ?? "",
            parentPhone: student.parentphone ?? existing.parentPhone ?? "",
            flaggedSubjects: student.flaggedSubjects,
          });
        } else {
          const newNotifData = {
            stud_id: student.id,
            registerNo: regNo,
            studentName: student.name ?? "Unknown student",
            parentEmail: student.parentEmail ?? "",
            parentPhone: student.parentphone ?? "",
            status: "pending",
            subject: "Low attendance alert",
            flaggedSubjects: student.flaggedSubjects,
            timestamp: new Date().toISOString(),
          };

          await setDoc(doc(db, "Notifications", regNo), {
            ...newNotifData,
            timestamp: serverTimestamp(),
          });

          finalNotifs.push({
            id: regNo,
            ...newNotifData,
          });
        }
      }

      setNotifications(finalNotifs);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const sendSingleNotification = async (notification: any) => {
    const emailVal = validateParentEmail(notification.parentEmail);
    if (emailVal.status !== "valid") {
      toast.error(`Parent email for ${notification.studentName} is missing or invalid.`);
      return false;
    }

    try {
      const res = await fetch("/api/attendance/notify-parent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: notification.studentName,
          parentEmail: notification.parentEmail.trim(),
          flaggedSubjects: notification.flaggedSubjects || [],
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to send email");
      }

      await setDoc(
        doc(db, "Notifications", notification.id),
        {
          status: "sent",
          sentAt: serverTimestamp(),
        },
        { merge: true },
      );

      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, status: "sent" } : n)),
      );

      toast.success(`Email alert sent to ${notification.parentEmail}`);
      return true;
    } catch (error: any) {
      const errMsg = error?.message || String(error);
      await setDoc(
        doc(db, "Notifications", notification.id),
        {
          status: "failed",
          error: errMsg,
          timestamp: serverTimestamp(),
        },
        { merge: true },
      );

      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, status: "failed", error: errMsg } : n)),
      );

      toast.error(`Failed to send email to ${notification.studentName}: ${errMsg}`);
      return false;
    }
  };

  const handleSendAllPending = async () => {
    setSending(true);
    const pendingNotifications = notifications.filter((n) => n.status === "pending");
    let sentCount = 0;
    let failCount = 0;

    for (const notif of pendingNotifications) {
      const ok = await sendSingleNotification(notif);
      if (ok) sentCount++;
      else failCount++;
    }

    if (sentCount > 0) {
      await addDoc(collection(db, "systemlogs"), {
        action: "notification",
        uploadedBy: auth.currentUser?.email ?? "Admin",
        records: pendingNotifications.length,
        flagged: pendingNotifications.length,
        sent: sentCount,
        failed: failCount,
        status: "success",
        timestamp: serverTimestamp(),
        fileName: "Parent notifications",
        messageTemplate: "Low attendance email alert",
      });
    }

    setSending(false);
    setConfirm(false);
    setTab("sent");
    toast.success(`Batch email dispatch completed: ${sentCount} sent, ${failCount} failed.`);
  };

  const rows = notifications.filter((n) => n.status === tab);

  return (
    <AppLayout>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">
            Parent notifications
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Email alerts sent to parents of flagged students.
          </p>
        </div>
        <button
          onClick={() => setConfirm(true)}
          disabled={counts.pending === 0 || sending}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send size={14} /> {sending ? "Sending emails..." : "Confirm & send"}
        </button>
      </div>

      <div className="mb-4 flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "relative flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium capitalize transition",
              tab === t
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                t === "pending"
                  ? "bg-warning-bg text-warning-fg"
                  : t === "sent"
                    ? "bg-success-bg text-success-fg"
                    : "bg-danger-bg text-danger-fg",
              )}
            >
              {counts[t]}
            </span>
          </button>
        ))}
      </div>

      <div className="card-surface overflow-hidden">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-subtle">
              <Inbox size={20} />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Nothing here yet</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                No {tab} notifications for the current filter.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Mobile stacked card view */}
            <div className="divide-y divide-border md:hidden">
              {rows.map((n) => (
                <div key={n.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground text-sm">{n.studentName}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {n.timestamp ? new Date(n.timestamp).toLocaleDateString() : "Recent"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Parent Email:</span>
                      <span className="font-mono text-foreground">
                        {n.parentEmail || "Email missing"}
                      </span>
                    </div>
                    <div className="text-right">
                      <StatusBadge
                        tone={
                          n.status === "sent"
                            ? "success"
                            : n.status === "failed"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {n.status === "sent"
                          ? "Delivered"
                          : n.status === "failed"
                            ? "Failed"
                            : "Pending"}
                      </StatusBadge>
                      {n.status === "failed" && n.error && (
                        <div className="text-[10px] text-danger-fg mt-0.5">{n.error}</div>
                      )}
                    </div>
                  </div>
                  {tab === "failed" && (
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => sendSingleNotification(n)}
                        className="btn-secondary h-8 text-xs px-2.5"
                      >
                        <RotateCw size={12} /> Retry email
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop table view */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr className="text-left text-xs font-semibold text-muted-foreground">
                    <th className="px-4 py-2.5">Student</th>
                    <th className="px-4 py-2.5">Parent Email</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Timestamp</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((n) => (
                    <tr key={n.id} className="transition hover:bg-muted/40">
                      <td className="px-4 py-3 font-medium text-foreground">{n.studentName}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {n.parentEmail || "Missing"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <StatusBadge
                            tone={
                              n.status === "sent"
                                ? "success"
                                : n.status === "failed"
                                  ? "danger"
                                  : "warning"
                            }
                          >
                            {n.status === "sent"
                              ? "Delivered"
                              : n.status === "failed"
                                ? "Failed"
                                : "Pending"}
                          </StatusBadge>
                          {n.status === "failed" && n.error && (
                            <span className="text-[11px] text-danger-fg">{n.error}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {n.timestamp ? new Date(n.timestamp).toLocaleString() : "Recent"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {tab === "failed" && (
                          <button
                            onClick={() => sendSingleNotification(n)}
                            className="btn-secondary h-8 text-xs"
                          >
                            <RotateCw size={12} /> Retry email
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send {counts.pending} parent email notifications?</DialogTitle>
            <DialogDescription>
              This will send attendance warning emails via Brevo SMTP to parents of all pending flagged students.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button onClick={() => setConfirm(false)} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={handleSendAllPending}
              disabled={sending}
              className="btn-primary"
            >
              <Send size={14} /> {sending ? "Sending..." : "Confirm & send emails"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
