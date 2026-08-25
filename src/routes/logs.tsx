import { auth, db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore"
import { createFileRoute } from "@tanstack/react-router";
import { Fragment } from "react";
import { AppLayout } from "@/components/app-layout";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, ScrollText } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/logs")({
  head: () => ({
    meta: [
      { title: "System logs — AttendPulse" },
      {
        name: "description",
        content: "Audit trail of attendance uploads and notification dispatches.",
      },
      { property: "og:title", content: "System logs — AttendPulse" },
      {
        property: "og:description",
        content: "Audit trail of attendance uploads and notification dispatches.",
      },
    ],
  }),
  component: LogsPage,
});

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const statusFilters = ["all", "completed", "in_progress", "failed"] as const;
type StatusFilter = (typeof statusFilters)[number];

function LogsPage() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState("all");
  const [date, setDate] = useState("");
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const snapshot = await getDocs(collection(db, "systemlogs"));

        const data = snapshot.docs.map((doc) => {
          const raw = doc.data();

          return {
            id: doc.id,

            action: raw.action ?? "upload",
            // Your Firebase field is timestamp, not datetime
            datetime: raw.timestamp?.toDate
              ? raw.timestamp.toDate().toISOString()
              : raw.timestamp ?? new Date().toISOString(),

            uploadedBy: String(raw.uploadedBy ?? "Unknown").trim(),

            // Your Firebase field is records
            processed: Number(raw.records ?? 0),

            // These aren't currently stored in Firebase
            flagged: Number(raw.flagged ?? 0),
            sent: Number(raw.sent ?? 0),
            failed: Number(raw.failed ?? 0),

            // Convert Firebase "success" into the UI's "completed"
            status:
              raw.status === "success"
                ? "completed"
                : raw.status === "failed"
                  ? "failed"
                  : "in_progress",
            fileName: raw.fileName ?? "Attendance upload",
            durationLabel: raw.durationLabel ?? "Not recorded",
            departments: raw.departments ?? "Not recorded",
            messageTemplate: raw.messageTemplate ?? "Not recorded",

            uploadedByEmail: String(raw.uploadedBy ?? "").trim(),
          };
        });

        console.log("LOGS FETCHED:", data);
        setLogs(data);
      } catch (error) {
        console.error("Error fetching system logs:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, []);
  const uploaders = useMemo(
    () => Array.from(new Set(logs.map((l) => l.uploadedBy))).sort(),
    [logs],
  );

  const rows = useMemo(() => {
    return logs.filter((l) => {
      if (status !== "all" && l.status !== status) return false;
      if (user !== "all" && l.uploadedBy !== user) return false;
      if (date && new Date(l.datetime).toISOString().slice(0, 10) !== date) return false;
      return true;
    });
  }, [logs, status, user, date]);

  return (
    <AppLayout>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">System logs</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Every upload, flag, and notification dispatch.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input-base w-auto"
          />
          <select
            value={user}
            onChange={(e) => setUser(e.target.value)}
            className="input-base w-auto pr-8"
          >
            <option value="all">Any user</option>
            {uploaders.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <div className="flex gap-1">
            {statusFilters.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium capitalize transition",
                  status === s
                    ? "border-primary bg-primary-tint text-primary"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {s.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card-surface flex flex-col items-center justify-center gap-2 py-16 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-subtle">
            <ScrollText size={20} />
          </div>
          <p className="text-sm font-medium text-foreground">No logs yet</p>
          <p className="text-xs text-muted-foreground">
            {logs.length === 0
              ? "Uploads and notification dispatches will show up here."
              : "No logs match the current filters."}
          </p>
        </div>
      ) : (
        <div className="card-surface overflow-hidden">
          {/* Mobile stacked collapsible card view */}
          <div className="divide-y divide-border md:hidden">
            {rows.map((l) => (
              <div key={l.id} className="transition hover:bg-muted/10">
                <div
                  className="flex items-start justify-between p-4 cursor-pointer"
                  onClick={() => setExpanded(expanded === l.id ? null : l.id)}
                >
                  <div className="flex gap-2.5 min-w-0">
                    <Avatar className="h-7 w-7 mt-0.5">
                      <AvatarFallback className="bg-primary-tint text-primary text-[11px] font-semibold">
                        {initials(l.uploadedBy)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">
                        {l.uploadedBy}
                      </div>
                      <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                        {new Date(l.datetime).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      tone={
                        l.status === "completed"
                          ? "success"
                          : l.status === "in_progress"
                            ? "info"
                            : "danger"
                      }
                      pulse={l.status === "in_progress"}
                    >
                      {l.status === "completed"
                        ? "Completed"
                        : l.status === "in_progress"
                          ? "In progress"
                          : "Failed"}
                    </StatusBadge>
                    <ChevronRight
                      size={14}
                      className={cn("text-subtle transition", expanded === l.id && "rotate-90")}
                    />
                  </div>
                </div>

                {/* Quick stats summary bar */}
                <div className="grid grid-cols-4 border-t border-border/60 bg-muted/20 px-4 py-2 text-center text-xs">
                  <div>
                    <div className="text-subtle text-[10px]">Processed</div>
                    <div className="font-semibold text-foreground tabular-nums mt-0.5">
                      {l.processed}
                    </div>
                  </div>
                  <div>
                    <div className="text-subtle text-[10px]">Flagged</div>
                    <div className="font-semibold text-danger-fg tabular-nums mt-0.5">
                      {l.flagged}
                    </div>
                  </div>
                  <div>
                    <div className="text-subtle text-[10px]">Sent</div>
                    <div className="font-semibold text-success-fg tabular-nums mt-0.5">
                      {l.sent}
                    </div>
                  </div>
                  <div>
                    <div className="text-subtle text-[10px]">Failed</div>
                    <div className="font-semibold text-danger-fg tabular-nums mt-0.5">
                      {l.failed}
                    </div>
                  </div>
                </div>

                {/* Expanded details */}
                {expanded === l.id && (
                  <div className="border-t border-border/60 bg-muted/30 p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <Detail label="File" value={l.fileName} mono />
                      <Detail label="Duration" value={l.durationLabel} />
                      <Detail label="Departments" value={l.departments} />
                      <Detail label="Message template" value={l.messageTemplate} />
                    </div>
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
                  <th className="w-8 px-4 py-2.5"></th>
                  <th className="px-4 py-2.5">Date & time</th>
                  <th className="px-4 py-2.5">Uploaded by</th>
                  <th className="px-4 py-2.5 text-right">Processed</th>
                  <th className="px-4 py-2.5 text-right">Flagged</th>
                  <th className="px-4 py-2.5 text-right">Sent</th>
                  <th className="px-4 py-2.5 text-right">Failed</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((l) => (
                  <Fragment key={l.id}>
                    <tr
                      className="cursor-pointer transition hover:bg-muted/40"
                      onClick={() => setExpanded(expanded === l.id ? null : l.id)}
                    >
                      <td className="px-4 py-3">
                        <ChevronRight
                          size={14}
                          className={cn("text-subtle transition", expanded === l.id && "rotate-90")}
                        />
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {new Date(l.datetime).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="bg-primary-tint text-primary text-[11px] font-semibold">
                              {initials(l.uploadedBy)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-foreground">
                              {l.uploadedBy}
                            </div>
                            <div className="text-[11px] text-subtle">{l.uploadedByEmail}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{l.processed}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-danger-fg">
                        {l.flagged}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-success-fg">
                        {l.sent}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-danger-fg">
                        {l.failed}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          tone={
                            l.status === "completed"
                              ? "success"
                              : l.status === "in_progress"
                                ? "info"
                                : "danger"
                          }
                          pulse={l.status === "in_progress"}
                        >
                          {l.status === "completed"
                            ? "Completed"
                            : l.status === "in_progress"
                              ? "In progress"
                              : "Failed"}
                        </StatusBadge>
                      </td>
                    </tr>
                    {expanded === l.id && (
                      <tr className="bg-muted/30">
                        <td colSpan={8} className="px-8 py-4">
                          <div className="grid gap-4 text-xs sm:grid-cols-4">
                            <Detail label="File" value={l.fileName} mono />
                            <Detail label="Duration" value={l.durationLabel} />
                            <Detail label="Departments" value={l.departments} />
                            <Detail label="Message template" value={l.messageTemplate} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

function Detail({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-subtle">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-foreground",
          mono && "font-mono text-[12px]",
          !value && "text-subtle",
        )}
      >
        {value || "Not recorded"}
      </div>
    </div>
  );
}
