import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, Loader2, Check } from "lucide-react";
import { AuthSplit } from "@/components/auth-shell";
import { Field } from "./index";
import { cn } from "@/lib/utils";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create account — AttendPulse" },
      {
        name: "description",
        content: "Create your AttendPulse account to manage attendance and parent alerts.",
      },
      { property: "og:title", content: "Create account — AttendPulse" },
      {
        property: "og:description",
        content: "Get started with attendance tracking and parent notifications.",
      },
    ],
  }),
  component: SignupPage,
});

function scorePassword(p: string) {
  let s = 0;
  if (p.length >= 8) s++;
  if (/[A-Z]/.test(p)) s++;
  if (/[0-9]/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return s;
}

function SignupPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [terms, setTerms] = useState(false);
  const [role, setRole] = useState<"admin" | "faculty">("admin");
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");

  const score = scorePassword(pw);
  const strengthLabel = ["Too weak", "Weak", "Okay", "Good", "Strong"][score];
  const strengthTone = ["bg-danger", "bg-danger", "bg-warning", "bg-info", "bg-success"][score];

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    if (pw !== confirm) {
      return;
    }

    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pw);
      const user = userCredential.user;

      await setDoc(doc(db, "users", user.uid), {
        name: name,
        email: email,
        phone: "",
        department: "",
        membersince: new Date().getFullYear().toString(),
        role: role,
      });

      navigate({ to: "/dashboard" });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthSplit title="Create your account" subtitle="Start monitoring attendance in minutes.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-base"
            placeholder="Priya Menon"
          />
        </Field>
        <Field label="Work email">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-base"
            placeholder="you@college.edu"
          />
        </Field>
        <Field label="Password">
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              required
              className="input-base pr-10"
              placeholder="At least 8 characters"
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              className="absolute right-2 top-1/2 grid -translate-y-1/2 place-items-center rounded p-1.5 text-subtle hover:text-foreground"
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {pw && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex flex-1 gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-1 flex-1 rounded-full",
                      i < score ? strengthTone : "bg-border",
                    )}
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">{strengthLabel}</span>
            </div>
          )}
        </Field>
        <Field label="Confirm password">
          <input
            type={showPw ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            className="input-base"
            placeholder="Re-enter password"
          />
          {confirm && confirm !== pw && (
            <p className="mt-1.5 text-xs text-danger-fg">Passwords do not match.</p>
          )}
        </Field>
        <Field label="Role">
          <div className="grid grid-cols-2 gap-2">
            {(["admin", "faculty"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={cn(
                  "flex items-center justify-between rounded-md border px-3 py-2 text-sm font-medium capitalize transition",
                  role === r
                    ? "border-primary bg-primary-tint text-primary"
                    : "border-border text-foreground hover:bg-muted",
                )}
              >
                {r}
                {role === r && <Check size={14} />}
              </button>
            ))}
          </div>
        </Field>

        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border-strong accent-primary"
          />
          <span>
            I agree to the{" "}
            <a className="font-medium text-primary hover:text-primary-hover">Terms</a> and{" "}
            <a className="font-medium text-primary hover:text-primary-hover">Privacy Policy</a>.
          </span>
        </label>

        <button type="submit" disabled={!terms || loading} className="btn-primary h-11 w-full">
          {loading ? <Loader2 size={16} className="animate-spin" /> : "Create account"}
        </button>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/" className="font-medium text-primary hover:text-primary-hover">
            Sign in
          </Link>
        </p>
      </form>
    </AuthSplit>
  );
}
