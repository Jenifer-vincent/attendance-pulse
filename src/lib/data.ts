// Shared data types for the attendance app.
//
// This app is not yet wired to a backend/API. All collections below start
// empty on purpose — each page renders an appropriate empty state (and, once
// real data fetching is added, a loading state) instead of showing sample
// records. Swap the empty arrays / `currentUser` for real API results when
// the backend is connected; the shapes are already what the UI expects.

export type Student = {
  id: string;
  registerNo: string;
  name: string;
  department: string;
  year: string;
  attendance: number;
  parentName: string;
  parentPhone: string;
};

export type NotificationStatus = "pending" | "sent" | "failed";

export type Notification = {
  id: string;
  studentName: string;
  parentPhone: string;
  status: NotificationStatus;
  timestamp: string;
  error?: string;
};

export type LogStatus = "completed" | "in_progress" | "failed";

export type LogEntry = {
  id: string;
  datetime: string;
  uploadedBy: string;
  uploadedByEmail: string;
  processed: number;
  flagged: number;
  sent: number;
  failed: number;
  status: LogStatus;
  fileName?: string;
  durationLabel?: string;
  departments?: string;
  messageTemplate?: string;
};

export type ActivityType = "upload" | "notify" | "flag" | "login";

export type ActivityItem = {
  id: string;
  type: ActivityType;
  who: string;
  text: string;
  time: string;
};

export type TrendPoint = {
  day: number;
  avg: number;
  flagged: number;
};

export type CurrentUser = {
  name: string;
  email: string;
  role: string;
  department: string;
  phone: string;
  memberSince: string;
};

// No attendance data has been uploaded/fetched yet.
export const students: Student[] = [];
export const flaggedStudents: Student[] = [];
export const criticalStudents: Student[] = [];

// No notifications have been sent/queued yet.
export const notifications: Notification[] = [];

// No upload/notification logs recorded yet.
export const logs: LogEntry[] = [];

// No attendance trend history to chart yet.
export const attendanceTrend: TrendPoint[] = [];

// No recent activity recorded yet.
export const recentActivity: ActivityItem[] = [];

// No signed-in user profile loaded yet.
export const currentUser: CurrentUser = {
  name: "",
  email: "",
  role: "",
  department: "",
  phone: "",
  memberSince: "",
};

/** Initials for an avatar fallback, or null when there's no name to derive them from. */
export function initialsOf(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  return trimmed
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
