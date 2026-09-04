import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useState, useMemo, useEffect } from "react";
import {
  Search,
  ArrowUpDown,
  FileSpreadsheet,
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { collection, getDocs, addDoc } from "firebase/firestore";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PAGE_SIZE = 40;

export function validateParentEmail(email?: string): {
  status: "valid" | "invalid" | "blank";
  message?: string;
} {
  if (!email || typeof email !== "string" || !email.trim()) {
    return { status: "blank", message: "Email missing" };
  }
  const trimmed = email.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { status: "invalid", message: "Invalid email format" };
  }
  return { status: "valid" };
}

export function normalizeMetadataKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export const NORMALIZED_METADATA_KEYS = new Set([
  "id",
  "studid",
  "studentid",
  "registerno",
  "regno",
  "registernumber",
  "regnumber",
  "sno",
  "slno",
  "no",
  "rollno",
  "studentname",
  "name",
  "department",
  "dept",
  "year",
  "parentname",
  "parentemail",
  "parentmail",
  "email",
  "parentnumber",
  "parentphone",
  "parentmobile",
  "parentcontact",
  "phone",
  "phonenumber",
  "mobilenumber",
  "mobile",
  "contact",
  "attendancepercent",
  "overallattendance",
  "attendance",
  "percentage",
  "percent",
  "total",
  "totalclasses",
  "attended",
  "totalattended",
  "flaggedsubjects",
  "subjects",
]);

export function extractSubjectsAndAttendance(row: any) {
  const subjects: Record<string, number> = {};
  
  if (row.subjects && typeof row.subjects === "object") {
    for (const key of Object.keys(row.subjects)) {
      const normKey = normalizeMetadataKey(key);
      if (!NORMALIZED_METADATA_KEYS.has(normKey) && !key.startsWith("__")) {
        const val = Number(row.subjects[key]);
        if (!isNaN(val) && val >= 0 && val <= 100) {
          subjects[key] = val;
        }
      }
    }
  }

  for (const key of Object.keys(row)) {
    const normKey = normalizeMetadataKey(key);
    if (!NORMALIZED_METADATA_KEYS.has(normKey) && !key.startsWith("__")) {
      const val = Number(row[key]);
      if (!isNaN(val) && val >= 0 && val <= 100) {
        subjects[key] = val;
      }
    }
  }

  let overall = Number(row.attendance_percent ?? row.attendance);
  if (
    isNaN(overall) ||
    (row.attendance_percent === undefined && row.attendance === undefined)
  ) {
    const subjectValues = Object.values(subjects);
    if (subjectValues.length > 0) {
      const sum = subjectValues.reduce((a, b) => a + b, 0);
      overall = Math.round((sum / subjectValues.length) * 100) / 100;
    } else {
      overall = 0;
    }
  }

  return { subjects, overall };
}

function logParsedRowDetails(
  studentName: string,
  parentEmail: string,
  subjects: Record<string, number>,
  overall: number,
) {
  console.log("-----------------------------------------");
  console.log(`Student: ${studentName}`);
  console.log(`Parent Email: ${parentEmail}`);
  console.log(`Detected Subjects: ${Object.keys(subjects).join(" | ")}`);
  console.log("Subject Values:");
  Object.entries(subjects).forEach(([sub, score]) => {
    console.log(`  ${sub}: ${score}`);
  });
  console.log(`Overall: ${overall}`);
  console.log("-----------------------------------------");
}

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
  const [expandedStudentIds, setExpandedStudentIds] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();

  const toggleExpandStudent = (id: string) => {
    setExpandedStudentIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const detectedSubjects = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s.subjects && typeof s.subjects === "object") {
        Object.keys(s.subjects).forEach((sub) => {
          const norm = normalizeMetadataKey(sub);
          if (!NORMALIZED_METADATA_KEYS.has(norm)) {
            set.add(sub);
          }
        });
      }
    });
    return Array.from(set);
  }, [students]);

  const rows = useMemo(
    () =>
      students.filter((s) => {
        const search = q.toLowerCase();

        const name = String(s.name ?? "");
        const registerNo = String(s.registerNo ?? s.studid ?? "");
        const email = String(s.parentEmail ?? "");

        return (
          !search ||
          name.toLowerCase().includes(search) ||
          registerNo.toLowerCase().includes(search) ||
          email.toLowerCase().includes(search)
        );
      }),
    [students, q],
  );

  useEffect(() => {
    const fetchStudents = async () => {
      try {
        console.log("[FIREBASE CONFIG] Project ID:", import.meta.env.VITE_FIREBASE_PROJECT_ID);
        console.log("CURRENT USER EMAIL:", auth.currentUser?.email);
        const previewData = sessionStorage.getItem("previewRows");

        if (previewData) {
          const rawRows = JSON.parse(previewData);
          console.log("[PREVIEW FETCH] Found previewRows in sessionStorage:", rawRows.length);

          const data = rawRows.map((row: any, index: number) => {
            const { subjects, overall } = extractSubjectsAndAttendance(row);
            const regNo =
              row["Register No"] ??
              row.register_no ??
              row.registerNo ??
              row.reg_no ??
              row.regno ??
              "";
            const name =
              row["Student Name"] ??
              row.student_name ??
              row.name ??
              "";
            const dept = row["Department"] ?? row.department ?? row.dept ?? "";
            const yr = row["Year"] ?? row.year ?? "";
            const pName =
              row["Parent Name"] ?? row.parent_name ?? row.parentName ?? "";
            const pEmail =
              row["Parent Email"] ??
              row.parent_email ??
              row.parentEmail ??
              row.email ??
              row.parent_mail ??
              "";
            const pPhone =
              row["Parent Phone"] ??
              row["Parent Number"] ??
              row.parent_phone ??
              row.parentphone ??
              row.parentPhone ??
              row.parent_number ??
              row.parentNumber ??
              row.phone ??
              "";

            logParsedRowDetails(name, pEmail, subjects, overall);

            return {
              id: `preview-${index}`,
              registerNo: regNo,
              name: name,
              department: dept,
              year: yr,
              attendance: overall,
              parentName: pName,
              parentEmail: pEmail,
              parentphone: pPhone,
              subjects: subjects,
            };
          });

          setStudents(data);
        } else {
          console.log("[PREVIEW FETCH] Querying Firestore 'students' collection...");
          const snapshot = await getDocs(collection(db, "students"));
          console.log("[PREVIEW FETCH] Firestore returned documents count:", snapshot.size);

          const data = snapshot.docs.map((doc) => {
            const docData = doc.data();
            const { subjects, overall } = extractSubjectsAndAttendance(docData);
            return {
              id: doc.id,
              ...docData,
              subjects,
              attendance: Number(docData.attendance ?? overall),
            };
          });

          setStudents(data);
        }
      } catch (error: any) {
        console.error("[STUDENT FETCH ERROR]", error);
        toast.error(`Failed to load students: ${error?.message || String(error)}`);
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
              placeholder="Search by name, reg. no, or email"
              className="input-base pl-8 md:w-72"
            />
          </div>
        </div>

        {/* Subjects Detected Banner */}
        {detectedSubjects.length > 0 && (
          <div className="mb-4 rounded-lg border border-primary/20 bg-primary-tint/30 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Subjects Detected:
            </div>
            <div className="text-sm font-semibold text-primary flex flex-wrap items-center gap-2">
              {detectedSubjects.join(" | ")}
            </div>
          </div>
        )}

        <div className="card-surface overflow-hidden">
          {/* Mobile stacked card view */}
          <div className="divide-y divide-border md:hidden">
            {pageRows.map((s) => {
              const emailVal = validateParentEmail(s.parentEmail);
              const isExpanded = !!expandedStudentIds[s.id];
              const subjectCount = Object.keys(s.subjects || {}).length;

              return (
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
                      <div className="mt-0.5">
                        {emailVal.status === "valid" ? (
                          <span className="text-muted-foreground font-mono text-[11px]">
                            {s.parentEmail}
                          </span>
                        ) : emailVal.status === "invalid" ? (
                          <span className="inline-flex items-center gap-1 text-danger-fg text-[11px] font-medium">
                            <AlertCircle size={11} /> {s.parentEmail} ({emailVal.message})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-warning-fg text-[11px] font-medium">
                            <AlertTriangle size={11} /> {emailVal.message}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {subjectCount > 0 && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => toggleExpandStudent(s.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        {isExpanded ? (
                          <>
                            <span>Hide Subjects</span>
                            <ChevronUp size={12} />
                          </>
                        ) : (
                          <>
                            <span>View Subjects</span>
                            <ChevronDown size={12} />
                          </>
                        )}
                      </button>
                      {isExpanded && (
                        <div className="mt-2 rounded-md bg-muted/60 p-2.5 space-y-1 text-xs font-mono">
                          {Object.entries(s.subjects).map(([subName, score]) => (
                            <div key={subName} className="flex justify-between items-center">
                              <span className="text-foreground">{subName}:</span>
                              <span className="font-semibold text-foreground tabular-nums">
                                {score}%
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
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
                    "Parent Email",
                    "Parent Number",
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
                {pageRows.map((s) => {
                  const emailVal = validateParentEmail(s.parentEmail);
                  const isExpanded = !!expandedStudentIds[s.id];
                  const subjectCount = Object.keys(s.subjects || {}).length;

                  return (
                    <tr key={s.id} className="transition hover:bg-muted/40 align-top">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {s.registerNo}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">{s.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.department}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.year}</td>
                      <td className="px-4 py-3">
                        <AttendanceBar value={Number(s.attendance)} />
                        {subjectCount > 0 && (
                          <div className="mt-1.5">
                            <button
                              type="button"
                              onClick={() => toggleExpandStudent(s.id)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                            >
                              {isExpanded ? (
                                <>
                                  <span>Hide Subjects</span>
                                  <ChevronUp size={12} />
                                </>
                              ) : (
                                <>
                                  <span>View Subjects</span>
                                  <ChevronDown size={12} />
                                </>
                              )}
                            </button>
                            {isExpanded && (
                              <div className="mt-2 rounded-md bg-muted/70 p-2 space-y-1 text-xs font-mono min-w-[160px]">
                                {Object.entries(s.subjects).map(([subName, score]) => (
                                  <div
                                    key={subName}
                                    className="flex justify-between items-center gap-3"
                                  >
                                    <span className="text-muted-foreground">{subName}:</span>
                                    <span className="font-semibold text-foreground tabular-nums">
                                      {score}%
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{s.parentName}</td>
                      <td className="px-4 py-3">
                        {emailVal.status === "valid" ? (
                          <span className="font-mono text-xs text-foreground">{s.parentEmail}</span>
                        ) : emailVal.status === "invalid" ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-mono text-xs text-danger-fg">{s.parentEmail}</span>
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-danger-fg">
                              <AlertCircle size={12} /> {emailVal.message}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-warning-bg/80 px-2 py-0.5 text-[11px] font-medium text-warning-fg">
                            <AlertTriangle size={12} /> {emailVal.message}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {s.parentphone}
                      </td>
                    </tr>
                  );
                })}
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
                  console.log("[IMPORT] Records to upload:", uploadedRows.length);

                  for (const row of uploadedRows) {
                    const { subjects, overall } = extractSubjectsAndAttendance(row);
                    const regNo =
                      row["Register No"] ?? row.register_no ?? row.registerNo ?? "";
                    const studName =
                      row["Student Name"] ?? row.student_name ?? row.name ?? "";
                    const dept = row["Department"] ?? row.department ?? row.dept ?? "";
                    const yr = row["Year"] ?? row.year ?? "";
                    const pName =
                      row["Parent Name"] ?? row.parent_name ?? row.parentName ?? "";
                    const pEmail =
                      row["Parent Email"] ??
                      row.parent_email ??
                      row.parentEmail ??
                      row.email ??
                      row.parent_mail ??
                      "";
                    const pPhone =
                      row["Parent Phone"] ??
                      row["Parent Number"] ??
                      row.parent_phone ??
                      row.parentphone ??
                      row.parentPhone ??
                      row.parent_number ??
                      row.parentNumber ??
                      row.phone ??
                      "";

                    logParsedRowDetails(studName, pEmail, subjects, overall);

                    console.log("[IMPORT] Writing student:", regNo, studName);
                    console.log("[FIRESTORE IMPORT] Writing student:", {
                      registerNo: regNo,
                      name: studName,
                      parentName: pName,
                      parentEmail: pEmail,
                      parentphone: pPhone,
                      subjects: subjects,
                      attendance: overall,
                    });

                    try {
                      await addDoc(collection(db, "students"), {
                        registerNo: regNo,
                        name: studName,
                        department: dept,
                        year: yr,
                        parentName: pName,
                        parentEmail: pEmail,
                        parentphone: pPhone,
                        subjects: subjects,
                        attendance: overall,
                      });
                    } catch (studentErr: any) {
                      console.error(
                        `[FIRESTORE IMPORT STUDENT ERROR] Failed writing student ${studName} (${regNo}):`,
                        studentErr,
                      );
                      throw studentErr;
                    }
                  }

                  console.log("[IMPORT] Upload completed");

                  const postImportSnapshot = await getDocs(collection(db, "students"));
                  console.log("[IMPORT] Firestore students after upload:", postImportSnapshot.size);

                  const firstRowDept =
                    uploadedRows[0]?.department ??
                    uploadedRows[0]?.Department ??
                    uploadedRows[0]?.dept ??
                    "Not recorded";

                  await addDoc(collection(db, "systemlogs"), {
                    action: "upload",
                    timestamp: new Date().toISOString(),
                    uploadedBy: auth.currentUser?.email ?? "Admin",
                    records: uploadedRows.length,
                    flagged: uploadedRows.filter((row: any) => {
                      const { subjects, overall } = extractSubjectsAndAttendance(row);
                      const hasLowSubject = Object.values(subjects).some((score) => Number(score) < 75);
                      return overall < 75 || hasLowSubject;
                    }).length,
                    sent: 0,
                    failed: 0,
                    status: "success",
                    fileName: sessionStorage.getItem("uploadFileName") ?? "Attendance upload",
                    departments: firstRowDept,
                    durationLabel: "Not recorded",
                    messageTemplate: "Not recorded",
                  });

                  sessionStorage.removeItem("previewRows");
                  sessionStorage.removeItem("uploadFileName");

                  const data = postImportSnapshot.docs.map((doc) => {
                    const docData = doc.data();
                    const { subjects, overall } = extractSubjectsAndAttendance(docData);
                    return {
                      id: doc.id,
                      ...docData,
                      subjects,
                      attendance: Number(docData.attendance ?? overall),
                    };
                  });
                  setStudents(data);

                  toast.success(
                    `${uploadedRows.length} students imported successfully`,
                  );

                  navigate({ to: "/low-attendance" });
                } catch (error: any) {
                  console.error("[FIRESTORE IMPORT ERROR]", error);
                  console.error("[FIRESTORE IMPORT ERROR MESSAGE]", error?.message);
                  console.error("[FIRESTORE IMPORT ERROR CODE]", error?.code);
                  console.error("[FIRESTORE IMPORT ERROR DETAILS]", error);
                  const errorMessage = error?.message || String(error);
                  toast.error(`Firestore import failed: ${errorMessage}`);
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