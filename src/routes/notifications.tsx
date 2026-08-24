import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useEffect, useState } from "react";
import { Send, RotateCw, Inbox } from "lucide-react";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
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

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Parent notifications — AttendPulse" },
      {
        name: "description",
        content: "Manage pending, sent, and failed WhatsApp alerts to parents.",
      },
      { property: "og:title", content: "Parent notifications — AttendPulse" },
      {
        property: "og:description",
        content: "Manage pending, sent, and failed WhatsApp alerts to parents.",
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

  const counts = {
    pending: notifications.filter((n) => n.status === "pending").length,
    sent: notifications.filter((n) => n.status === "sent").length,
    failed: notifications.filter((n) => n.status === "failed").length,
  };
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        // Get all students
        const studentSnapshot = await getDocs(
          collection(db, "students")
        );
        console.log("STUDENTS FOUND:", studentSnapshot.size);

        studentSnapshot.docs.forEach((studentDoc) => {
          console.log(
            "STUDENT:",
            studentDoc.id,
            studentDoc.data()
          );
        });

        // Get existing notifications
        const notificationSnapshot = await getDocs(
          collection(db, "Notifications")
        );

        const existingNotifications = notificationSnapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        // Existing student IDs that already have notifications
        const existingStudentIds = new Set(
          existingNotifications.map((n: any) => n.stud_id)
        );

        // Create notifications for uploaded students below 75%
        const newNotifications = [];

        for (const studentDoc of studentSnapshot.docs) {
          const student = studentDoc.data();

          const attendance = Number(student.attendance ?? 0);
          console.log(
            "CHECKING STUDENT:",
            studentDoc.id,
            "attendance:",
            attendance,
            "already has notification:",
            existingStudentIds.has(studentDoc.id)
          );

          if (
            attendance < 75 &&
            !existingStudentIds.has(studentDoc.id)
          ) {
            const notificationData = {
              stud_id: studentDoc.id,
              status: "pending",
              subject: "Low attendance alert",
              timestamp: serverTimestamp(),
            };

            const newDoc = await addDoc(
              collection(db, "Notifications"),
              notificationData
            );

            newNotifications.push({
              id: newDoc.id,
              ...notificationData,
              studentName: student.name ?? "Unknown student",
              parentPhone: student.parentphone ?? "Not available",
            });
          }
        }

        // Build final notification list
        const data = [
          ...existingNotifications.map((notification: any) => {
            const student = studentSnapshot.docs.find(
              (s) => s.id === notification.stud_id
            );

            const studentData = student?.data();

            return {
              ...notification,
              studentName: studentData?.name ?? "Unknown student",
              parentPhone: studentData?.parentphone ?? "Not available",
            };
          }),
          ...newNotifications,
        ];

        console.log("NOTIFICATIONS:", data);

        setNotifications(data);
      } catch (error) {
        console.error("Error fetching notifications:", error);
      }
    };

    fetchNotifications();
  }, []);
  const rows = notifications.filter((n) => n.status === tab);

  return (
    <AppLayout>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">
            Parent notifications
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            WhatsApp alerts sent to parents of flagged students.
          </p>
        </div>
        <button
          onClick={async () => {
            try {
              const pendingNotifications = notifications.filter(
                (n) => n.status === "pending"
              );

              for (const notification of pendingNotifications) {
                await updateDoc(doc(db, "Notifications", notification.id), {
                  status: "sent",
                  sentAt: serverTimestamp(),
                });
              }

              setNotifications((prev) =>
                prev.map((n) =>
                  n.status === "pending"
                    ? { ...n, status: "sent" }
                    : n
                )
              );

              await addDoc(collection(db, "systemlogs"), {
                action: "notification",
                uploadedBy: auth.currentUser?.email ?? "Unknown",
                records: pendingNotifications.length,
                flagged: pendingNotifications.length,
                sent: pendingNotifications.length,
                failed: 0,
                status: "success",
                timestamp: serverTimestamp(),
                fileName: "Parent notifications",
                messageTemplate: "Low attendance alert",
              });

              setConfirm(false);
              setTab("sent");

              toast.success(`${pendingNotifications.length} alerts sent successfully`);
            } catch (error) {
              console.error("Error sending notifications:", error);
              toast.error("Failed to send notifications.");
            }
          }}
          className="btn-primary"
        >
          <Send size={14} /> Confirm & send
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
                      {new Date(n.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Phone:</span>
                      <span className="font-mono tabular-nums text-foreground">
                        {n.parentPhone}
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
                        onClick={() => toast.success(`Retrying alert for ${n.studentName}`)}
                        className="btn-secondary h-8 text-xs px-2.5"
                      >
                        <RotateCw size={12} /> Retry
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
                    <th className="px-4 py-2.5">Parent phone</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Timestamp</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((n) => (
                    <tr key={n.id} className="transition hover:bg-muted/40">
                      <td className="px-4 py-3 font-medium text-foreground">{n.studentName}</td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {n.parentPhone}
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
                        {new Date(n.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {tab === "failed" && (
                          <button
                            onClick={() => toast.success(`Retrying alert for ${n.studentName}`)}
                            className="btn-secondary h-8 text-xs"
                          >
                            <RotateCw size={12} /> Retry
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
            <DialogTitle>Send {counts.pending} notifications?</DialogTitle>
            <DialogDescription>
              This will dispatch WhatsApp alerts to the parents of all pending flagged students.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button onClick={() => setConfirm(false)} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={() => {
                setConfirm(false);
                toast.success(`${counts.pending} alerts queued`);
              }}
              className="btn-primary"
            >
              <Send size={14} /> Confirm & send
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
