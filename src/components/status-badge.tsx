import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const toneClasses: Record<Tone, { wrap: string; dot: string }> = {
  success: { wrap: "bg-success-bg text-success-fg", dot: "bg-success" },
  warning: { wrap: "bg-warning-bg text-warning-fg", dot: "bg-warning" },
  danger: { wrap: "bg-danger-bg text-danger-fg", dot: "bg-danger" },
  info: { wrap: "bg-info-bg text-info-fg", dot: "bg-info" },
  neutral: { wrap: "bg-muted text-muted-foreground", dot: "bg-subtle" },
};

export function StatusBadge({
  tone = "neutral",
  children,
  pulse = false,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  pulse?: boolean;
  className?: string;
}) {
  const t = toneClasses[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
        t.wrap,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", t.dot, pulse && "animate-pulse")} />
      {children}
    </span>
  );
}
