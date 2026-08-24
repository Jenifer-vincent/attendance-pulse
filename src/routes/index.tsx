import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import React, { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { AuthSplit } from "@/components/auth-shell";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sign in — AttendPulse" },
      { name: "description", content: "Sign in to manage attendance and parent alerts." },
      { property: "og:title", content: "Sign in — AttendPulse" },
      { property: "og:description", content: "Sign in to manage attendance and parent alerts." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate({ to: "/dashboard" });
    } catch (err) {
      setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthSplit title="Welcome back" subtitle="Sign in to your AttendPulse account.">
      {error && (
        <div className="mb-4 rounded-md border border-danger/20 bg-danger-bg p-3 text-xs text-danger-fg">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
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
        <Field
          label="Password"
          trailing={
            <Link
              to="/forgot-password"
              className="text-xs font-medium text-primary hover:text-primary-hover"
            >
              Forgot password?
            </Link>
          }
        >
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-base pr-10"
              placeholder="Enter your password"
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              className="absolute right-2 top-1/2 grid -translate-y-1/2 place-items-center rounded p-1.5 text-subtle hover:text-foreground"
              aria-label={showPw ? "Hide password" : "Show password"}
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>

        <button type="submit" disabled={loading} className="btn-primary h-[44px] w-full">
          {loading ? <Loader2 size={16} className="animate-spin" /> : "Sign in"}
        </button>

        <p className="text-center text-sm text-muted-foreground">
          Don't have an account?{" "}
          <Link to="/signup" className="font-medium text-primary hover:text-primary-hover">
            Sign up
          </Link>
        </p>
      </form>
    </AuthSplit>
  );
}

export function Field({
  label,
  trailing,
  children,
}: {
  label: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {trailing}
      </div>
      {children}
    </label>
  );
}
