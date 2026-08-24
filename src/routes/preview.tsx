import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useState, useMemo, useEffect } from "react";
import { Search, ArrowUpDown, FileSpreadsheet } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { collection, getDocs, addDoc } from "firebase/firestore";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PAGE_SIZE = 40;

export const Route = createFileRoute("/preview")({
  head: () => ({
    meta: [
      { title: "Preview attendance — AttendPulse" },
      { name: "description", content: "Review parsed attendance rows before confirming upload." },
      { property: "og:title", content: "Preview attendance — AttendPulse" },
      {
        property: "og:description",
        content: "Review parsed attendance rows before confirming upload.",
      },
    ],
  }),
  component: PreviewPage,
});

function PreviewPage() {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const rows = useMemo(
    () =>
      students.filter((s) => {
        const search = q.toLowerCase();

        const name = String(s.name ?? "");
        const registerNo = String(s.registerNo ?? s.studid ?? "");

        return (
          !search ||
          name.toLowerCase().includes(search) ||
          registerNo.toLowerCase().includes(search)
        );
      }),
    [students, q],
  );

  useEffect(() => {
    const fetchStudents = async () => {
      try {
        console.log("CURRENT USER EMAIL:", auth.currentUser?.email);
        const previewData = sessionStorage.getItem("previewRows");

        if (previewData) {
          const rows = JSON.parse(previewData);

          const data = rows.map((row: any, index: number) => ({
            id: `preview-${index}`,
            registerNo: row.register_no,
            name: row.student_name,
            department: row.department,
            year: row.year,
            attendance: Number(row.attendance_percent),
            parentName: row.parent_name,
            parentphone: row.parent_phone,
          }));

          setStudents(data);
        } else {
          const snapshot = await getDocs(collection(db, "students"));

          const data = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));

          setStudents(data);
        }
      } catch (error) {
        console.error("Error fetching students:", error);
        toast.error("Failed to load students");
      } finally {
        setLoading(false);
      }
    };

    fetchStudents();
  }, []);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
          Loading attendance data...
        </div>
      </AppLayout>
    );
  }

  if (students.length === 0) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-subtle">
            <FileSpreadsheet size={20} />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">No attendance data to preview yet</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Upload a CSV or Excel file to see parsed records here.
            </p>
          </div>
          <Link to="/upload" className="btn-primary mt-2">
            Upload attendance file
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="pb-24">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-foreground">
              Preview attendance data
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">{rows.length}</span>{" "}
              records parsed from your uploaded file
            </p>
          </div>
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or reg. no"
              className="input-base pl-8 md:w-72"
            />
          </div>
        </div>

        <div className="card-surface overflow-hidden">
          {/* Mobile stacked card view */}
          <div className="divide-y divide-border md:hidden">
            {pageRows.map((s) => (
              <div key={s.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground text-sm">{s.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{s.registerNo}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {s.department} · {s.year}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <AttendanceBar value={Number(s.attendance)} />
                  <div className="text-right text-xs">
                    <div className="text-foreground">{s.parentName}</div>
                    <div className="text-muted-foreground tabular-nums">{s.parentphone}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table view */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <tr className="text-left">
                  {[
                    "Reg. No",
                    "Student",
                    "Department",
                    "Year",
                    "Attendance",
                    "Parent",
                    "Phone",
                  ].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        {h}
                        <ArrowUpDown size={11} className="text-subtle" />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pageRows.map((s) => (
                  <tr key={s.id} className="transition hover:bg-muted/40">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {s.registerNo}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{s.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.department}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.year}</td>
                    <td className="px-4 py-3">
                      <AttendanceBar value={Number(s.attendance)} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{s.parentName}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {s.parentphone}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
            <span>
              Showing {rows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, rows.length)} of {rows.length}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded border border-border px-2 py-1 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                Prev
              </button>

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded border border-border px-2 py-1 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* Sticky action bar */}
        {/* Sticky action bar */}
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur lg:pl-64 lg:pr-6">
          <div className="mx-auto flex max-w-[1440px] items-center justify-end gap-2">
            <button
              onClick={() => navigate({ to: "/upload" })}
              className="btn-secondary"
            >
              Cancel
            </button>

            <button
              onClick={async () => {
                try {
                  const previewData = sessionStorage.getItem("previewRows");

                  if (!previewData) {
                    toast.error("No uploaded data found.");
                    return;
                  }

                  const uploadedRows = JSON.parse(previewData);

                  for (const row of uploadedRows) {
                    await addDoc(collection(db, "students"), {
                      registerNo: row.register_no,
                      name: row.student_name,
                      department: row.department,
                      year: row.year,
                      attendance: Number(row.attendance_percent),
                      parentName: row.parent_name,
                      parentphone: row.parent_phone,
                    });
                  }
                  await addDoc(collection(db, "systemlogs"), {
                    action: "upload",
                    timestamp: new Date().toISOString(),
                    uploadedBy: auth.currentUser?.email ?? "Admin",
                    records: uploadedRows.length,
                    flagged: uploadedRows.filter(
                      (row: any) => Number(row.attendance_percent) < 75
                    ).length,
                    sent: 0,
                    failed: 0,
                    status: "success",
                    fileName: sessionStorage.getItem("uploadFileName") ?? "Attendance upload",
                    departments: uploadedRows[0]?.department ?? "Not recorded",
                    durationLabel: "Not recorded",
                    messageTemplate: "Not recorded",
                  });

                  sessionStorage.removeItem("previewRows");

                  toast.success(
                    `${uploadedRows.length} students imported successfully`,
                  );

                  navigate({ to: "/low-attendance" });
                } catch (error) {
                  console.error("Error importing students:", error);
                  toast.error("Failed to import students.");
                }
              }}
              className="btn-primary"
            >
              Confirm upload ({rows.length} students)
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
function AttendanceBar({ value }: { value: number }) {
  const attendance = Number(value);

  const tone =
    attendance < 60
      ? "danger"
      : attendance < 75
        ? "warning"
        : "success";

  const color =
    tone === "danger"
      ? "bg-danger"
      : tone === "warning"
        ? "bg-warning"
        : "bg-success";

  const text =
    tone === "danger"
      ? "text-danger-fg"
      : tone === "warning"
        ? "text-warning-fg"
        : "text-success-fg";

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", color)}
          style={{ width: `${attendance}%` }}
        />
      </div>

      <span className={cn("text-xs font-medium tabular-nums", text)}>
        {attendance}%
      </span>
    </div>
  );
}