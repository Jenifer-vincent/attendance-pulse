import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useRef, useState } from "react";
import {
  UploadCloud,
  FileSpreadsheet,
  X,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

const DEPARTMENT_OPTIONS = ["BCA", "BCA Gen AI", "BCA DS"] as const;

const ACCEPTED_EXCEL_EXTENSIONS = [".xls", ".xlsx"];
const ACCEPTED_EXCEL_MIME_TYPES = [
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

function isExcelFile(file: File) {
  const name = file.name.toLowerCase();
  const hasExcelExtension = ACCEPTED_EXCEL_EXTENSIONS.some((ext) => name.endsWith(ext));
  const hasExcelMimeType = file.type ? ACCEPTED_EXCEL_MIME_TYPES.includes(file.type) : false;
  // Some browsers/OSes report no MIME type for .xls/.xlsx, so extension alone is enough,
  // but if a MIME type IS present, it must match an Excel type.
  return file.type ? hasExcelExtension && hasExcelMimeType : hasExcelExtension;
}

export const Route = createFileRoute("/upload")({
  head: () => ({
    meta: [
      { title: "Upload attendance — AttendPulse" },
      { name: "description", content: "Upload an Excel file of student attendance." },
      { property: "og:title", content: "Upload attendance — AttendPulse" },
      { property: "og:description", content: "Upload an Excel file of student attendance." },
    ],
  }),
  component: UploadPage,
});

function UploadPage() {
  const [dragOver, setDragOver] = useState(false);
  const [state, setState] = useState<"idle" | "uploading" | "success">("idle");
  const [progress, setProgress] = useState(0);
  const [openGuide, setOpenGuide] = useState(false);

  const [department, setDepartment] = useState<string>("");
  const [departmentError, setDepartmentError] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelection(file?: File | null) {
    if (!file) return;

    if (!isExcelFile(file)) {
      setSelectedFile(null);
      const message = "Only Excel files (.xls or .xlsx) are supported. Please choose a valid file.";
      setFileError(message);
      toast.error(message);
      return;
    }

    setSelectedFile(file);
    setFileError(null);
  }

  function clearSelectedFile() {
    setSelectedFile(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function startUpload() {
    let hasError = false;

    if (!department) {
      setDepartmentError("Please select a department to continue.");
      hasError = true;
    }

    if (!selectedFile) {
      const message = "Please select an Excel file (.xls or .xlsx) to upload.";
      setFileError(message);
      hasError = true;
    }

    if (hasError) {
      toast.error("Please fix the highlighted fields before uploading.");
      return;
    }

    try {
      setState("uploading");
      setProgress(10);

      const buffer = await selectedFile!.arrayBuffer();

      setProgress(40);

      const workbook = XLSX.read(buffer, { type: "array" });

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const rows = XLSX.utils.sheet_to_json(worksheet);

      console.log("Excel rows:", rows);
      sessionStorage.setItem("previewRows", JSON.stringify(rows));
      sessionStorage.setItem("uploadFileName", selectedFile!.name);

      const user = auth.currentUser;

      await addDoc(collection(db, "systemlogs"), {
        action: "Attendance file uploaded",
        fileName: selectedFile!.name,
        department: department,
        rowCount: rows.length,
        userEmail: user?.email ?? "",
        timestamp: serverTimestamp(),
      });

      setProgress(100);
      setState("success");

      toast.success(`${rows.length} rows read from Excel`);
    } catch (error) {
      console.error("Error reading Excel file:", error);
      setState("idle");
      setProgress(0);
      toast.error("Failed to read the Excel file.");
    }
  }
  function resetUpload() {
    setState("idle");
    setProgress(0);
    clearSelectedFile();
  }

  return (
    <AppLayout>
      <div className="max-w-3xl">
        <div className="mb-6">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Upload attendance file
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Import an Excel sheet. We'll validate columns before you confirm.
          </p>
        </div>

        {/* Department selection */}
        <div className="mb-6">
          <Label htmlFor="department" className="text-foreground">
            Department <span className="text-danger">*</span>
          </Label>
          <Select
            value={department}
            onValueChange={(value) => {
              setDepartment(value);
              setDepartmentError(null);
            }}
          >
            <SelectTrigger
              id="department"
              aria-invalid={!!departmentError}
              className={cn(
                "mt-1.5 max-w-xs",
                departmentError && "border-danger focus:ring-danger",
              )}
            >
              <SelectValue placeholder="Select a department" />
            </SelectTrigger>
            <SelectContent>
              {DEPARTMENT_OPTIONS.map((dept) => (
                <SelectItem key={dept} value={dept}>
                  {dept}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {departmentError && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-danger">
              <AlertCircle size={12} />
              {departmentError}
            </p>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            handleFileSelection(file);
            e.target.value = "";
          }}
        />

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            handleFileSelection(file);
          }}
          className={cn(
            "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center transition",
            dragOver
              ? "border-primary bg-primary-tint"
              : fileError
                ? "border-danger/60 bg-danger/5"
                : "border-border-strong bg-surface hover:border-primary hover:bg-primary-tint/40",
          )}
        >
          <div className="grid h-12 w-12 place-items-center rounded-full bg-primary-tint text-primary">
            <UploadCloud size={22} strokeWidth={1.75} />
          </div>
          <h3 className="mt-4 text-sm font-semibold text-foreground">
            Drop your file here, or browse
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">Supports .xls and .xlsx up to 10 MB</p>
          <button onClick={() => fileInputRef.current?.click()} className="btn-primary mt-5">
            Browse files
          </button>
        </div>

        {/* File preview — part of the same upload component, updates instantly */}
        <div
          className={cn(
            "mt-3 flex items-center gap-3 rounded-md border px-3 py-2.5",
            fileError
              ? "border-danger/50 bg-danger/5"
              : selectedFile
                ? "border-border bg-surface"
                : "border-border/70 bg-muted/30",
          )}
        >
          <div
            className={cn(
              "grid h-8 w-8 shrink-0 place-items-center rounded-md",
              selectedFile ? "bg-primary-tint text-primary" : "bg-muted text-subtle",
            )}
          >
            <FileSpreadsheet size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div
              className={cn(
                "truncate text-sm",
                selectedFile ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {selectedFile ? selectedFile.name : "No file selected"}
            </div>
            {fileError && (
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-danger">
                <AlertCircle size={12} />
                {fileError}
              </div>
            )}
          </div>
          {selectedFile && (
            <button
              onClick={clearSelectedFile}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-subtle hover:bg-muted hover:text-foreground"
              aria-label="Remove selected file"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {state === "idle" && (
          <div className="mt-4 flex justify-end">
            <button onClick={startUpload} className="btn-primary">
              Upload file <ArrowRight size={14} />
            </button>
          </div>
        )}

        {state !== "idle" && (
          <div className="mt-4">
            <div
              className={cn(
                "card-surface flex items-center gap-3 p-4",
                state === "success" && "border-success/40 bg-success-bg/40",
              )}
            >
              <div
                className={cn(
                  "grid h-10 w-10 place-items-center rounded-md",
                  state === "success"
                    ? "bg-success-bg text-success-fg"
                    : "bg-primary-tint text-primary",
                )}
              >
                {state === "success" ? <CheckCircle2 size={18} /> : <FileSpreadsheet size={18} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate text-sm font-medium text-foreground">
                    {selectedFile?.name ?? "Selected file"}
                  </div>
                  <div className="text-xs tabular-nums text-muted-foreground">{`${progress}%`}</div>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      state === "success" ? "bg-success" : "bg-primary",
                    )}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              <button
                onClick={resetUpload}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-subtle hover:bg-muted hover:text-foreground"
              >
                <X size={14} />
              </button>
            </div>

            {state === "success" && (
              <div className="mt-3 flex justify-end">
                <Link to="/preview" className="btn-primary">
                  Preview data <ArrowRight size={14} />
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Column reference guide */}
        <div className="mt-8 card-surface">
          <button
            onClick={() => setOpenGuide((o) => !o)}
            className="flex w-full items-center justify-between p-4 text-left"
          >
            <div>
              <div className="text-sm font-semibold text-foreground">Expected column format</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Column names and example values your file should include
              </div>
            </div>
            {openGuide ? (
              <ChevronUp size={16} className="text-subtle" />
            ) : (
              <ChevronDown size={16} className="text-subtle" />
            )}
          </button>
          {openGuide && (
            <div className="border-t border-border p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium text-muted-foreground">
                      <th className="pb-2 pr-4">Column</th>
                      <th className="pb-2 pr-4">Type</th>
                      <th className="pb-2">Example</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[
                      ["register_no", "string", "CS21012"],
                      ["student_name", "string", "Aarav Sharma"],
                      ["department", "string", "Computer Science"],
                      ["year", "string", "3rd Year"],
                      ["attendance_percent", "number 0–100", "72"],
                      ["parent_name", "string", "Rakesh Sharma"],
                      ["parent_phone", "E.164 phone", "+91 9876543210"],
                    ].map(([c, t, e]) => (
                      <tr key={c}>
                        <td className="py-2 pr-4 font-mono text-xs text-foreground">{c}</td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground">{t}</td>
                        <td className="py-2 text-xs text-muted-foreground">{e}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
