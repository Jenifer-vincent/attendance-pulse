import { Link, useRouter } from "@tanstack/react-router";
import { useState, useEffect, type ReactNode } from "react";
import {
  LayoutDashboard,
  Upload,
  Eye,
  AlertTriangle,
  Send,
  ScrollText,
  User,
  Search,
  Bell,
  Menu,
  X,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  Settings,
  GraduationCap,
  Download,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { flaggedStudents, notifications, currentUser, initialsOf } from "@/lib/data";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type AppRoute =
  | "/dashboard"
  | "/upload"
  | "/preview"
  | "/low-attendance"
  | "/notifications"
  | "/logs"
  | "/profile";

const nav: {
  to: AppRoute;
  label: string;
  icon: LucideIcon;
  badge?: () => number;
  badgeTone?: "danger" | "warning";
}[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/upload", label: "Upload", icon: Upload },
  { to: "/preview", label: "Preview", icon: Eye },
  {
    to: "/low-attendance",
    label: "Low Attendance",
    icon: AlertTriangle,
    badge: () => flaggedStudents.length,
    badgeTone: "danger",
  },
  {
    to: "/notifications",
    label: "Notifications",
    icon: Send,
    badge: () => notifications.filter((n) => n.status === "pending").length,
    badgeTone: "warning",
  },
  { to: "/logs", label: "Logs", icon: ScrollText },
  { to: "/profile", label: "Profile", icon: User },
];

const titleMap: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/upload": "Upload Attendance",
  "/preview": "Attendance Preview",
  "/low-attendance": "Low Attendance",
  "/notifications": "Parent Notifications",
  "/logs": "System Logs",
  "/profile": "Profile",
};

export function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = router.state.location.pathname;
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const title = titleMap[pathname] ?? "AttendPulse";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden border-r border-border bg-surface transition-[width] duration-200 lg:block",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <SidebarContent
          collapsed={collapsed}
          pathname={pathname}
          onToggle={() => setCollapsed(!collapsed)}
        />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-border bg-surface">
            <SidebarContent
              collapsed={false}
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      <div
        className={cn(
          "flex min-h-screen flex-col transition-[padding] duration-200",
          collapsed ? "lg:pl-16" : "lg:pl-60",
        )}
      >
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur lg:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-muted lg:hidden"
            aria-label="Open menu"
          >
            <Menu size={18} strokeWidth={1.75} />
          </button>
          <h1 className="text-sm font-semibold text-foreground lg:text-[15px]">{title}</h1>

          <div className="ml-auto flex items-center gap-2">
            <div className="relative hidden md:block">
              <Search
                size={16}
                strokeWidth={1.75}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle"
              />
              <input
                placeholder="Search students, uploads…"
                className="h-9 w-64 rounded-md border border-border bg-background pl-8 pr-16 text-sm text-foreground placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                ⌘K
              </kbd>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger className="relative grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-muted">
                <Bell size={18} strokeWidth={1.75} />
                {notifications.some((n) => n.status === "pending") && (
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger ring-2 ring-surface" />
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifications.length === 0 ? (
                  <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                    No notifications yet
                  </div>
                ) : (
                  notifications.slice(0, 4).map((n) => (
                    <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-0.5 py-2">
                      <span className="text-sm font-medium">{n.studentName}</span>
                      <span className="text-xs text-muted-foreground">
                        {n.status === "sent"
                          ? "Alert delivered"
                          : n.status === "failed"
                            ? n.error
                            : "Queued for delivery"}
                      </span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 rounded-md p-1 hover:bg-muted">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary-tint text-primary text-xs font-semibold">
                    {initialsOf(currentUser.name) ?? <User size={14} />}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {currentUser.name || "Your account"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {currentUser.email || "No email on file"}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/profile">
                    <Settings size={14} className="mr-2" /> Profile &amp; Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/">
                    <LogOut size={14} className="mr-2" /> Sign out
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 lg:px-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => void;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function SidebarContent({
  collapsed,
  pathname,
  onToggle,
  onNavigate,
}: {
  collapsed: boolean;
  pathname: string;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "flex h-14 items-center border-b border-border px-4",
          collapsed && "justify-center px-0",
        )}
      >
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
            <GraduationCap size={18} strokeWidth={2} />
          </div>
          {!collapsed && (
            <span className="font-display text-[15px] font-bold tracking-tight text-foreground">
              AttendPulse
            </span>
          )}
        </div>
        {onNavigate && (
          <button
            onClick={onNavigate}
            className="ml-auto grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted lg:hidden"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {nav.map((item) => {
          const active = pathname === item.to;
          const Icon = item.icon;
          const badge = item.badge?.();
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary-tint text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                collapsed && "justify-center px-0",
              )}
            >
              {active && (
                <span className="absolute left-0 top-1.5 h-[calc(100%-12px)] w-0.5 rounded-r bg-primary" />
              )}
              <Icon size={18} strokeWidth={1.75} className="shrink-0" />
              {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
              {!collapsed && badge ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                    item.badgeTone === "danger"
                      ? "bg-danger-bg text-danger-fg"
                      : "bg-warning-bg text-warning-fg",
                  )}
                >
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {deferredPrompt && (
        <div className="p-2 border-t border-border">
          <button
            onClick={handleInstall}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium text-primary bg-primary-tint hover:bg-primary-tint/80 transition-colors",
              collapsed && "justify-center px-0",
            )}
          >
            <Download size={16} className="shrink-0" />
            {!collapsed && <span>Install App</span>}
          </button>
        </div>
      )}

      {onToggle && (
        <div className="border-t border-border p-2">
          <button
            onClick={onToggle}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      )}
    </div>
  );
}
