import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { StatusBadge } from "@/components/status-badge";
import {
  Users,
  AlertTriangle,
  Send,
  Bell,
  CalendarClock,
  Upload,
  Eye,
  ArrowRight,
  Activity,
  type LucideIcon,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — AttendPulse" },
      {
        name: "description",
        content: "At-a-glance attendance metrics, flagged students, and notification activity.",
      },
      { property: "og:title", content: "Dashboard — AttendPulse" },
      {
        property: "og:description",
        content: "At-a-glance attendance metrics and notification activity.",
      },
    ],
  }),
  component: Dashboard,
});

const toneStyles = {
  info: "bg-info-bg text-info-fg",
  danger: "bg-danger-bg text-danger-fg",
  success: "bg-success-bg text-success-fg",
  warning: "bg-warning-bg text-warning-fg",
  neutral: "bg-primary-tint text-primary",
};

function Dashboard() {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [studentCount, setStudentCount] = useState(0);
  const [flaggedCount, setFlaggedCount] = useState(0);
  const [departmentCount, setDepartmentCount] = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);
  const [sentNotificationCount, setSentNotificationCount] = useState(0);
  const [lastUpload, setLastUpload] = useState<any>(null);
  const [recentActivityData, setRecentActivityData] = useState<any[]>([]);
  const [attendanceTrendData, setAttendanceTrendData] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCheckingAuth(false);

        try {
          const snapshot = await getDocs(collection(db, "students"));

          const studentMap = new Map<string, any>();
          snapshot.docs.forEach((doc) => {
            const data = doc.data();
            const regNo = String(data.registerNo ?? data.register_no ?? doc.id).trim().toUpperCase();
            if (!studentMap.has(regNo)) {
              studentMap.set(regNo, data);
            }
          });

          const uniqueStudents = Array.from(studentMap.values());
          setStudentCount(uniqueStudents.length);

          const depts = new Set(uniqueStudents.map((s) => s.department).filter(Boolean));
          setDepartmentCount(depts.size);

          const below75 = uniqueStudents.filter((data) => {
            return Number(data.attendance) < 75;
          });

          setFlaggedCount(below75.length);
          const totalAttendance = uniqueStudents.reduce((sum, data) => {
            return sum + Number(data.attendance || 0);
          }, 0);

          const averageAttendance =
            uniqueStudents.length > 0 ? totalAttendance / uniqueStudents.length : 0;

          setAttendanceTrendData([
            {
              day: "Today",
              avg: Math.round(averageAttendance),
              flagged: below75.length,
            },
          ]);

          const notificationSnapshot = await getDocs(
            collection(db, "Notifications"),
          );

          setNotificationCount(notificationSnapshot.size);

          const sentNotifications = notificationSnapshot.docs.filter((doc) => {
            const data = doc.data();
            return data.status === "sent";
          });

          setSentNotificationCount(sentNotifications.length);

          const logsSnapshot = await getDocs(
            collection(db, "systemlogs"),
          );

          const uploadLogs = logsSnapshot.docs
            .map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }))
            .filter((log: any) => log.action === "Attendance file uploaded");
          const activities: any[] = [];

          uploadLogs.forEach((log: any) => {
            activities.push({
              id: log.id,
              type: "upload",
              who: log.uploadedBy ?? "Admin",
              text: `uploaded ${log.records ?? 0} student records`,
              time: log.timestamp?.toDate
                ? log.timestamp.toDate().toLocaleString()
                : "Recently",
            });
          });

          notificationSnapshot.docs.forEach((notificationDoc) => {
            const notification = notificationDoc.data();

            activities.push({
              id: notificationDoc.id,
              type: "notify",
              who: "Admin",
              text:
                notification.status === "sent"
                  ? "sent a parent notification"
                  : "created a parent notification",
              time: notification.timestamp?.toDate
                ? notification.timestamp.toDate().toLocaleString()
                : "Recently",
            });
          });

          setRecentActivityData(
            activities
              .sort((a, b) => {
                return (
                  new Date(b.time).getTime() -
                  new Date(a.time).getTime()
                );
              })
              .slice(0, 5)
          );

          if (uploadLogs.length > 0) {
            const latest = uploadLogs.sort(
              (a: any, b: any) =>
                b.timestamp.toMillis() - a.timestamp.toMillis(),
            )[0];

            setLastUpload(latest);
            console.log("LATEST UPLOAD:", latest);
          }
        } catch (error) {
          console.error("Error fetching dashboard data:", error);
        }
      } else {
        window.location.href = "/";
      }
    });

    const timeout = setTimeout(() => {
      if (!auth.currentUser) {
        window.location.href = "/";
      }
    }, 3000);

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const stats = [
    {
      label: "Total Students",
      value: studentCount,
      sub:
        departmentCount > 0
          ? `Across ${departmentCount} department${departmentCount === 1 ? "" : "s"}`
          : "No students uploaded yet",
      icon: Users,
      tone: "info" as const,
    },
    {
      label: "Below 75%",
      value: flaggedCount,
      sub: "Needs parent alerts",
      icon: AlertTriangle,
      tone: "danger" as const,
    },
    {
      label: "Messages Sent Today",
      value: sentNotificationCount,
      sub: sentNotificationCount > 0 ? "Delivered alerts" : "No messages sent yet",
      icon: Send,
      tone: "success" as const,
    },
    {
      label: "Total Notifications",
      value: notificationCount,
      sub: notificationCount > 0 ? "All time" : "No notifications yet",
      icon: Bell,
      tone: "warning" as const,
    },
    {
      label: "Last Upload",
      value: lastUpload?.timestamp?.toDate ? lastUpload.timestamp.toDate().toLocaleDateString() : "—",
      sub: lastUpload ? `by ${lastUpload.uploadedBy ?? "Admin"}` : "No uploads yet",
      icon: CalendarClock,
      tone: "neutral" as const,
    },
  ];

  if (checkingAuth) {
    return <div>Checking authentication...</div>;
  }
  return (
    <AppLayout>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="card-surface p-4 transition-shadow hover:shadow-elevated">
            <div className="flex items-start justify-between">
              <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
              <div className={cn("grid h-8 w-8 place-items-center rounded-md", toneStyles[s.tone])}>
                <s.icon size={16} strokeWidth={1.75} />
              </div>
            </div>
            <div className="mt-3 font-display text-2xl font-bold tabular-nums text-foreground">

              {s.label === "Total Students"
                ? studentCount
                : s.label === "Below 75%"
                  ? flaggedCount
                  : s.label === "Total Notifications"
                    ? notificationCount
                    : s.label === "Messages Sent Today"
                      ? sentNotificationCount
                      : s.label === "Last Upload"
                        ? lastUpload
                          ? lastUpload.timestamp.toDate().toLocaleDateString()
                          : "—"
                        : s.value
              }
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {s.label === "Last Upload"
                ? lastUpload
                  ? `by ${lastUpload.uploadedBy ?? "Admin"}`
                  : "No uploads yet"
                : s.sub}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 card-surface p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Attendance trend</h3>
            <p className="text-xs text-muted-foreground">
              Average class attendance and flagged count, last 30 days
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-primary" /> Avg %
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-danger" /> Flagged
            </span>
          </div>
        </div>
        <div className="mt-4 h-56 w-full">
          {attendanceTrendData.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <Activity size={22} className="text-subtle" />
              <p className="text-sm text-muted-foreground">No attendance trend data yet</p>
              <p className="text-xs text-subtle">Upload attendance to start seeing trends here</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={attendanceTrendData}
                margin={{ top: 10, right: 8, bottom: 0, left: -16 }}
              >
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: "var(--color-subtle)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--color-subtle)" }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid var(--color-border)",
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="avg"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  fill="url(#g1)"
                />
                <Area
                  type="monotone"
                  dataKey="flagged"
                  stroke="var(--color-danger)"
                  strokeWidth={1.5}
                  fill="transparent"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Recent activity */}
        <div className="card-surface p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Recent activity</h3>
            <Link to="/logs" className="text-xs font-medium text-primary hover:text-primary-hover">
              View all
            </Link>
          </div>
          {recentActivityData.length === 0 ? (
            <div className="mt-4 flex flex-col items-center justify-center gap-2 py-8 text-center">
              <Activity size={20} className="text-subtle" />
              <p className="text-sm text-muted-foreground">No recent activity</p>
              <p className="text-xs text-subtle">Uploads and notifications will show up here</p>
            </div>
          ) : (
            <ul className="mt-4 space-y-4">
              {recentActivityData.map((a, i) => (
                <li key={a.id} className="flex gap-3">
                  <div className="relative flex flex-col items-center">
                    <div
                      className={cn(
                        "mt-1 h-2 w-2 rounded-full",
                        a.type === "notify"
                          ? "bg-success"
                          : a.type === "flag"
                            ? "bg-danger"
                            : a.type === "upload"
                              ? "bg-info"
                              : "bg-subtle",
                      )}
                    />
                    {i < recentActivityData.length - 1 && (
                      <div className="mt-1 w-px flex-1 bg-border" />
                    )}
                  </div>
                  <div className="flex-1 pb-1">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">{a.who}</span>{" "}
                      <span className="text-muted-foreground">{a.text}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-subtle">{a.time}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Quick actions */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Quick actions</h3>
          <QuickAction
            to="/upload"
            icon={Upload}
            title="Upload attendance"
            desc="Import a new CSV or Excel file"
            tone="info"
          />
          <QuickAction
            to="/low-attendance"
            icon={AlertTriangle}
            title="View flagged students"
            desc={`${flaggedCount} students below 75%`}
            tone="danger"
          />
          <QuickAction
            to="/notifications"
            icon={Send}
            title="Send notifications"
            desc="Alert parents via Email"
            tone="success"
          />
        </div>
      </div>
    </AppLayout>
  );
}

function QuickAction({
  to,
  icon: Icon,
  title,
  desc,
  tone,
}: {
  to: "/upload" | "/low-attendance" | "/notifications";
  icon: LucideIcon;
  title: string;
  desc: string;
  tone: keyof typeof toneStyles;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 card-surface p-4 transition hover:border-border-strong hover:shadow-elevated"
    >
      <div
        className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-md", toneStyles[tone])}
      >
        <Icon size={18} strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="truncate text-xs text-muted-foreground">{desc}</div>
      </div>
      <ArrowRight
        size={16}
        className="text-subtle transition group-hover:translate-x-0.5 group-hover:text-primary"
      />
    </Link>
  );
}
