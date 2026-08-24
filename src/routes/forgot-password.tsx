import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, GraduationCap, Loader2, ArrowLeft } from "lucide-react";
import { Field } from "./index";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset password — AttendPulse" },
      { name: "description", content: "Reset your AttendPulse password by email." },
      { property: "og:title", content: "Reset password — AttendPulse" },
      { property: "og:description", content: "Reset your AttendPulse password by email." },
    ],
  }),
  component: ForgotPage,
});

function ForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      console.log("Sending reset email to:", email);

      await sendPasswordResetEmail(auth, email);

      console.log("Reset email request succeeded");
      setSent(true);
      setCooldown(30);
    } catch (error) {
      console.error("Password reset failed:", error);
    } finally {
      setLoading(false);
    }
  }


  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground">
            <GraduationCap size={18} />
          </div>
          <span className="font-display text-base font-bold tracking-tight">AttendPulse</span>
        </div>

        <div className="card-surface p-6 sm:p-8">
          {!sent ? (
            <>
              <h1 className="font-display text-xl font-bold tracking-tight">Reset your password</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Enter your email and we'll send you a reset link.
              </p>
              <form onSubmit={submit} className="mt-6 space-y-4">
                <Field label="Email">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-base"
                    placeholder="you@college.edu"
                  />
                </Field>
                <button type="submit" disabled={loading} className="btn-primary h-11 w-full">
                  {loading ? <Loader2 size={16} className="animate-spin" /> : "Send reset link"}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success-bg text-success-fg">
                <CheckCircle2 size={22} strokeWidth={2} />
              </div>
              <h1 className="mt-4 font-display text-xl font-bold tracking-tight">
                Check your email
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                We sent a reset link to{" "}
                <span className="font-medium text-foreground">{email || "your inbox"}</span>.
              </p>
              <button
                onClick={() => cooldown === 0 && setCooldown(30)}
                disabled={cooldown > 0}
                className="btn-secondary mx-auto mt-6"
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend email"}
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
