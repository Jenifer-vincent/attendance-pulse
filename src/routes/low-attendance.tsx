import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useState, useMemo, useEffect } from "react";
import { AlertTriangle, Send, CheckCircle2, AlertCircle } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { extractSubjectsAndAttendance, validateParentEmail } from "./preview";

export const Route = createFileRoute("/low-attendance")({
  head: () => ({
    meta: [
      { title: "Low attendance — AttendPulse" },
      { name: "description", content: "Students flagged for attendance below the 75% threshold." },
      { property: "og:title", content: "Low attendance — AttendPulse" },
      {
        property: "og:description",
        content: "Students flagged for attendance below the 75% threshold.",
      },
    ],
  }),
  component: LowAttendancePage,
});

const filters = [
  { id: "all", label: "All flagged" },
  { id: "critical", label: "Critical (<60%)" },
  { id: "warning", label: "Warning (60–75%)" },
] as const;

function LowAttendancePage() {
  const [f, setF] = useState<(typeof filters)[number]["id"]>("all");
  const [department, setDepartment] = useState("all");
  const [year, setYear] = useState("all");
  const [flaggedStudents, setFlaggedStudents] = useState<any[]>([]);
  const [criticalCount, setCriticalCount] = useState(0);
  const [notifStates, setNotifStates] = useState<Record<string, "sending" | "sent" | "failed">>({});
  const [sendingAll, setSendingAll] = useState(false);

  useEffect(() => {
    const fetchFlaggedStudents = async () => {
      try {
        console.log("[LOW ATTENDANCE FETCH] Querying Firestore 'students' collection...");
        const snapshot = await getDocs(collection(db, "students"));
        console.log("[LOW ATTENDANCE FETCH] Firestore returned documents count:", snapshot.size);

        // Deduplicate existing student documents by registerNo
        const studentMap = new Map<string, any>();

        snapshot.docs.forEach((docSnap) => {
          const data: any = docSnap.data();
          const regNo = String(data.registerNo ?? data.register_no ?? docSnap.id).trim().toUpperCase();

          if (!studentMap.has(regNo)) {
            const { subjects, overall } = extractSubjectsAndAttendance(data);
            const lowSubjects = Object.entries(subjects)
              .filter(([_, score]) => Number(score) < 75)
              .map(([subject, score]) => ({ subject, attendance: Number(score) }));

            const att = Number(data.attendance ?? overall);
            const isFlagged = att < 75 || lowSubjects.length > 0;

            if (isFlagged) {
              studentMap.set(regNo, {
                id: docSnap.id,
                ...data,
                registerNo: regNo,
                subjects,
                attendance: att,
                flaggedSubjects: lowSubjects,
                isFlagged: true,
              });
            }
          }
        });

        const flagged = Array.from(studentMap.values());
        console.log("[LOW ATTENDANCE FETCH] Unique flagged students count:", flagged.length);
        setFlaggedStudents(flagged);

        const critical = flagged.filter((student: any) => {
          const overall = Number(student.attendance);
          const hasCriticalSubject = (student.flaggedSubjects || []).some(
            (s: any) => s.attendance < 60,
          );
          return overall < 60 || hasCriticalSubject;
        });

        setCriticalCount(critical.length);

        // Fetch existing notification statuses
        const notifSnapshot = await getDocs(collection(db, "Notifications"));
        const existingStates: Record<string, "sending" | "sent" | "failed"> = {};
        notifSnapshot.docs.forEach((d) => {
          const notifData = d.data();
          const studId = notifData.stud_id || d.id;
          if (notifData.status === "sent" || notifData.status === "failed") {
            existingStates[studId] = notifData.status;
          }
        });
        setNotifStates(existingStates);
      } catch (error) {
        console.error("Error fetching low-attendance students:", error);
      }
    };

    fetchFlaggedStudents();
  }, []);

  const sendEmailNotification = async (student: any) => {
    const emailVal = validateParentEmail(student.parentEmail);
    if (emailVal.status !== "valid") {
      toast.error(`Parent email for ${student.name} is invalid or missing.`);
      return false;
    }

    setNotifStates((prev) => ({ ...prev, [student.id]: "sending" }));

    try {
      const res = await fetch("/api/attendance/notify-parent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: student.name,
          parentEmail: student.parentEmail.trim(),
          flaggedSubjects: student.flaggedSubjects || [],
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to send email via server endpoint");
      }

      // Update Notifications collection in Firestore with 'sent' status
      await setDoc(
        doc(db, "Notifications", student.registerNo || student.id),
        {
          stud_id: student.id,
          studentName: student.name,
          parentEmail: student.parentEmail.trim(),
          status: "sent",
          flaggedSubjects: student.flaggedSubjects || [],
          sentAt: serverTimestamp(),
        },
        { merge: true },
      );

      setNotifStates((prev) => ({ ...prev, [student.id]: "sent" }));
      toast.success(`Email sent to ${student.parentEmail}`);
      return true;
    } catch (err: any) {
      console.error("[NOTIFY PARENT ERROR]", err);
      const errMsg = err?.message || String(err);

      // Update Notifications collection in Firestore with 'failed' status
      await setDoc(
        doc(db, "Notifications", student.registerNo || student.id),
        {
          stud_id: student.id,
          studentName: student.name,
          parentEmail: student.parentEmail || "",
          status: "failed",
          error: errMsg,
          flaggedSubjects: student.flaggedSubjects || [],
          timestamp: serverTimestamp(),
        },
        { merge: true },
      );

      setNotifStates((prev) => ({ ...prev, [student.id]: "failed" }));
      toast.error(`Failed to send email to ${student.name}: ${errMsg}`);
      return false;
    }
  };

  const handleSendAll = async () => {
    setSendingAll(true);
    let sentCount = 0;
    let failCount = 0;

    for (const student of rows) {
      const emailVal = validateParentEmail(student.parentEmail);
      if (emailVal.status === "valid" && notifStates[student.id] !== "sent") {
        const success = await sendEmailNotification(student);
        if (success) sentCount++;
        else failCount++;
      }
    }

    setSendingAll(false);
    toast.info(`Bulk email batch complete: ${sentCount} sent, ${failCount} failed.`);
  };

  const departments = useMemo(
    () =>
      Array.from(
        new Set(flaggedStudents.map((s: any) => s.department).filter(Boolean)),
      ).sort(),
    [flaggedStudents],
  );

  const years = useMemo(
    () =>
      Array.from(
        new Set(flaggedStudents.map((s: any) => s.year).filter(Boolean)),
      ).sort(),
    [flaggedStudents],
  );

  const rows = useMemo(() => {
    let list = flaggedStudents;

    if (f === "critical") {
      list = list.filter((s: any) => Number(s.attendance) < 60);
    }

    if (f === "warning") {
      list = list.filter(
        (s: any) =>
          Number(s.attendance) >= 60 && Number(s.attendance) < 75,
      );
    }

    if (department !== "all") {
      list = list.filter((s: any) => s.department === department);
    }

    if (year !== "all") {
      list = list.filter((s: any) => s.year === year);
    }

    return list;
  }, [flaggedStudents, f, department, year]);

  return (
    <AppLayout>
      <div className="mb-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="card-surface p-5">
          <div className="flex items-start gap-4">
            <div className="grid h-11 w-11 place-items-center rounded-md bg-danger-bg text-danger-fg">
              <AlertTriangle size={20} strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-display text-2xl font-bold tabular-nums text-foreground">
                {flaggedStudents.length} students flagged
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Attendance is below the 75% threshold. Notify parents via email to trigger intervention.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusBadge tone="danger">Critical · {criticalCount}</StatusBadge>
                <StatusBadge tone="warning">
                  Warning · {flaggedStudents.length - criticalCount}
                </StatusBadge>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-end">
          <button
            onClick={handleSendAll}
            disabled={flaggedStudents.length === 0 || sendingAll}
            className="btn-primary h-11 w-full disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
          >
            <Send size={14} /> {sendingAll ? "Sending emails..." : "Send email alerts to all flagged"}
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {filters.map((x) => (
          <button
            key={x.id}
            onClick={() => setF(x.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition",
              f === x.id
                ? "border-primary bg-primary-tint text-primary"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {x.label}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="input-base h-9 w-auto pr-8 text-xs"
          >
            <option value="all">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="input-base h-9 w-auto pr-8 text-xs"
          >
            <option value="all">All years</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card-surface flex flex-col items-center justify-center gap-2 py-16 text-center">
          <AlertTriangle size={20} className="text-subtle" />
          <p className="text-sm font-medium text-foreground">No flagged students</p>
          <p className="text-xs text-muted-foreground">
            {flaggedStudents.length === 0
              ? "Upload attendance data to flag students below 75%."
              : "No students match the current filters."}
          </p>
        </div>
      ) : (
        <div className="card-surface overflow-hidden">
          {/* Mobile stacked card view */}
          <div className="divide-y divide-border md:hidden">
            {rows.map((s) => {
              const critical = Number(s.attendance) < 60;
              const emailVal = validateParentEmail(s.parentEmail);
              const currentState = notifStates[s.id];

              return (
                <div
                  key={s.id}
                  className={cn(
                    "p-4 space-y-2 relative border-l-2",
                    critical ? "border-l-danger" : "border-l-warning",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-foreground text-sm">{s.name}</div>
                      <div className="font-mono text-[10px] text-subtle">{s.registerNo}</div>
                    </div>
                    <div className="text-right">
                      <span className="font-semibold text-sm tabular-nums text-foreground">
                        {s.attendance}%
                      </span>
                      <div className="mt-0.5">
                        <StatusBadge tone={critical ? "danger" : "warning"}>
                          {critical ? "Critical" : "Warning"}
                        </StatusBadge>
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {s.department} · {s.year}
                  </div>

                  {/* Flagged Low Subjects list */}
                  {s.flaggedSubjects && s.flaggedSubjects.length > 0 && (
                    <div className="rounded-md bg-muted/60 p-2 text-xs font-mono space-y-0.5">
                      <div className="text-[10px] text-muted-foreground font-sans font-semibold uppercase">
                        Low Attendance Subjects (&lt;75%):
                      </div>
                      {s.flaggedSubjects.map((sub: any) => (
                        <div key={sub.subject} className="flex justify-between text-danger-fg font-medium">
                          <span>{sub.subject}:</span>
                          <span className="tabular-nums">{sub.attendance}%</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <div className="text-xs">
                      <span className="text-muted-foreground">Parent: </span>
                      <span className="font-medium text-foreground">{s.parentName}</span>
                      {emailVal.status === "valid" ? (
                        <span className="text-muted-foreground block font-mono text-[11px]">
                          {s.parentEmail}
                        </span>
                      ) : (
                        <span className="text-danger-fg block text-[11px] font-medium">
                          Parent email missing
                        </span>
                      )}
                    </div>

                    <NotifyButton
                      emailStatus={emailVal.status}
                      state={currentState}
                      onNotify={() => sendEmailNotification(s)}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table view */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr className="text-left text-xs font-semibold text-muted-foreground">
                  <th className="px-4 py-2.5">Student</th>
                  <th className="px-4 py-2.5">Department</th>
                  <th className="px-4 py-2.5">Attendance</th>
                  <th className="px-4 py-2.5">Flagged Subjects (&lt;75%)</th>
                  <th className="px-4 py-2.5">Parent Details</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((s) => {
                  const critical = s.attendance < 60;
                  const emailVal = validateParentEmail(s.parentEmail);
                  const currentState = notifStates[s.id];

                  return (
                    <tr
                      key={s.id}
                      className={cn(
                        "relative transition hover:bg-muted/40 align-top",
                        critical ? "border-l-2 border-l-danger" : "border-l-2 border-l-warning",
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{s.name}</div>
                        <div className="mt-0.5 font-mono text-[11px] text-subtle">
                          {s.registerNo}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {s.department} · {s.year}
                      </td>
                      <td className="px-4 py-3">
                        <div className="tabular-nums font-semibold text-foreground">
                          {s.attendance}%
                        </div>
                        <div className="mt-1">
                          <StatusBadge tone={critical ? "danger" : "warning"}>
                            {critical ? "Critical" : "Warning"}
                          </StatusBadge>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {s.flaggedSubjects && s.flaggedSubjects.length > 0 ? (
                          <div className="space-y-1 font-mono text-xs">
                            {s.flaggedSubjects.map((sub: any) => (
                              <div key={sub.subject} className="flex justify-between gap-3 text-danger-fg">
                                <span>{sub.subject}:</span>
                                <span className="font-semibold tabular-nums">{sub.attendance}%</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Overall &lt;75%</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-foreground font-medium">{s.parentName}</div>
                        {emailVal.status === "valid" ? (
                          <div className="text-xs font-mono text-muted-foreground">
                            {s.parentEmail}
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1 text-[11px] font-medium text-danger-fg mt-0.5">
                            <AlertCircle size={11} /> Parent email missing
                          </div>
                        )}
                        {s.parentphone && (
                          <div className="text-xs tabular-nums text-subtle mt-0.5">
                            {s.parentphone}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <NotifyButton
                          emailStatus={emailVal.status}
                          state={currentState}
                          onNotify={() => sendEmailNotification(s)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

function NotifyButton({
  emailStatus,
  state,
  onNotify,
}: {
  emailStatus: "valid" | "invalid" | "blank";
  state?: "sending" | "sent" | "failed";
  onNotify: () => void;
}) {
  if (emailStatus !== "valid") {
    return (
      <button
        disabled
        className="btn-secondary h-8 text-xs opacity-50 cursor-not-allowed text-danger-fg border-danger/30"
      >
        Parent email missing
      </button>
    );
  }

  if (state === "sending") {
    return (
      <button disabled className="btn-secondary h-8 text-xs opacity-70 cursor-wait">
        Sending...
      </button>
    );
  }

  if (state === "sent") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-success-fg bg-success-bg/60 border border-success/30 px-2.5 py-1.5 rounded-md">
        <CheckCircle2 size={13} /> Email sent ✓
      </span>
    );
  }

  if (state === "failed") {
    return (
      <button
        onClick={onNotify}
        className="btn-secondary h-8 text-xs text-danger-fg border-danger/50 hover:bg-danger-bg"
      >
        Failed to send email (Retry)
      </button>
    );
  }

  return (
    <button onClick={onNotify} className="btn-secondary h-8 text-xs px-3">
      <Send size={12} /> Notify parent
    </button>
  );
}
