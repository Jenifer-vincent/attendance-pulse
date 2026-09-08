import { GraduationCap } from "lucide-react";
import type { ReactNode } from "react";

export function AuthSplit({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* Left brand panel */}
      <div className="relative hidden overflow-hidden bg-primary lg:flex lg:flex-col lg:justify-between lg:p-12 text-primary-foreground">
        <div className="flex items-center gap-3">
          <img
            src="/logo.jpg"
            alt="AttendPulse"
            className="h-10 w-10 rounded-full object-cover shrink-0 border-2 border-amber-400"
          />
          <span className="font-display text-xl font-bold tracking-tight">AttendPulse</span>
        </div>

        <div className="relative">
          <h2 className="max-w-md font-display text-3xl font-bold leading-tight">
            Catch attendance dips before they become failures.
          </h2>
          <p className="mt-3 max-w-sm text-sm text-primary-foreground/80">
            Upload once. Flag automatically. Alert parents on WhatsApp — all in one clean dashboard.
          </p>
        </div>

        {/* Abstract line illustration */}
        <svg
          viewBox="0 0 400 200"
          className="pointer-events-none absolute -bottom-10 -right-10 h-72 w-96 opacity-20"
          fill="none"
        >
          <path d="M0 150 Q80 40 160 90 T320 60 T480 120" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M0 170 Q80 60 160 110 T320 80 T480 140"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M0 190 Q80 80 160 130 T320 100 T480 160"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <circle cx="160" cy="90" r="3" fill="currentColor" />
          <circle cx="320" cy="60" r="3" fill="currentColor" />
        </svg>

        <div className="relative text-xs text-primary-foreground/70">
          © {new Date().getFullYear()} AttendPulse
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex flex-col justify-center bg-surface px-6 py-12 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <img
              src="/logo.jpg"
              alt="AttendPulse"
              className="h-8 w-8 rounded-full object-cover shrink-0 border border-primary/20"
            />
            <span className="font-display text-base font-bold tracking-tight">AttendPulse</span>
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
