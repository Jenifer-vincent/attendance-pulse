import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useState, useMemo, useEffect } from "react";
import { AlertTriangle, Send } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { extractSubjectsAndAttendance } from "./preview";

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

  useEffect(() => {
    const fetchFlaggedStudents = async () => {
      try {
        console.log("[LOW ATTENDANCE FETCH] Querying Firestore 'students' collection...");
        const snapshot = await getDocs(collection(db, "students"));
        console.log("[LOW ATTENDANCE FETCH] Firestore returned documents count:", snapshot.size);

        const flagged = snapshot.docs
          .map((doc) => {
            const data: any = doc.data();
            const { subjects, overall } = extractSubjectsAndAttendance(data);
            const lowSubjects = Object.entries(subjects)
              .filter(([_, score]) => Number(score) < 75)
              .map(([subject, score]) => ({ subject, attendance: Number(score) }));

            const att = Number(data.attendance ?? overall);
            const isFlagged = att < 75 || lowSubjects.length > 0;

            return {
              id: doc.id,
              ...data,
              subjects,
              attendance: att,
              flaggedSubjects: lowSubjects,
              isFlagged,
            };
          })
          .filter((student: any) => student.isFlagged);

        console.log("[LOW ATTENDANCE FETCH] Flagged students count:", flagged.length);
        setFlaggedStudents(flagged);

        const critical = flagged.filter((student: any) => {
          const overall = Number(student.attendance);
          const hasCriticalSubject = (student.flaggedSubjects || []).some(
            (s: any) => s.attendance < 60,
          );
          return overall < 60 || hasCriticalSubject;
        });

        setCriticalCount(critical.length);
      } catch (error) {
        console.error("Error fetching low-attendance students:", error);
      }
    };

    fetchFlaggedStudents();
  }, []);

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
                Attendance is below the 75% threshold. Notify parents to trigger intervention.
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
            onClick={() => toast.success(`Sending ${flaggedStudents.length} WhatsApp alerts…`)}
            disabled={flaggedStudents.length === 0}
            className="btn-primary h-11 w-full disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
          >
            <Send size={14} /> Send notifications to all flagged
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
                  <div className="flex items-center justify-between pt-1">
                    <div className="text-xs">
                      <span className="text-muted-foreground">Parent: </span>
                      <span className="font-medium text-foreground">{s.parentName}</span>
                      <span className="text-muted-foreground block tabular-nums">
                        {s.parentphone}
                      </span>
                    </div>
                    <button
                      onClick={() => toast.success(`Alert queued for ${s.parentName}`)}
                      className="btn-secondary h-8 text-xs px-2.5"
                    >
                      <Send size={12} /> Notify
                    </button>
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
                  <th className="px-4 py-2.5">Severity</th>
                  <th className="px-4 py-2.5">Parent</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((s) => {
                  const critical = s.attendance < 60;
                  return (
                    <tr
                      key={s.id}
                      className={cn(
                        "relative transition hover:bg-muted/40",
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
                      <td className="px-4 py-3 tabular-nums font-semibold text-foreground">
                        {s.attendance}%
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={critical ? "danger" : "warning"}>
                          {critical ? "Critical" : "Warning"}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-foreground">{s.parentName}</div>
                        {s.parentEmail && (
                          <div className="text-xs font-mono text-muted-foreground">
                            {s.parentEmail}
                          </div>
                        )}
                        <div className="text-xs tabular-nums text-muted-foreground">
                          {s.parentphone}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => toast.success(`Alert queued for ${s.parentName}`)}
                          className="btn-secondary h-8 text-xs"
                        >
                          <Send size={12} /> Notify parent
                        </button>
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
