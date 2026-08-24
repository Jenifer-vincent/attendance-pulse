import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useEffect, useState } from "react";
import { LogOut, Mail, Calendar, Shield, User, type LucideIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Field } from "./index";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { initialsOf } from "@/lib/data";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — AttendPulse" },
      { name: "description", content: "Manage your account details, password, and session." },
      { property: "og:title", content: "Profile — AttendPulse" },
      {
        property: "og:description",
        content: "Manage your account details, password, and session.",
      },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const [pw, setPw] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    department: "",
    phone: "",
  });
  const [profile, setProfile] = useState({
    name: "",
    email: "",
    role: "",
    department: "",
    phone: "",
    memberSince: "",
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        console.log("NO LOGGED-IN USER");
        return;
      }

      console.log("AUTH USER:", user.uid, user.email);

      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));

        if (userDoc.exists()) {
          console.log("PROFILE DATA:", userDoc.data());

          const data = userDoc.data();

          setProfile({
            name: data.name ?? "",
            email: data.email ?? user.email ?? "",
            role: data.role ?? "",
            department: data.department ?? "",
            phone: data.phone ?? "",
            memberSince: data.membersince ?? "",
          });

          setFormData({
            name: data.name ?? "",
            email: data.email ?? user.email ?? "",
            department: data.department ?? "",
            phone: data.phone ?? "",
          });

          setFormData({
            name: data.name ?? "",
            email: data.email ?? user.email ?? "",
            department: data.department ?? "",
            phone: data.phone ?? "",
          });
        } else {
          console.log("USER DOCUMENT NOT FOUND");
        }
      } catch (error) {
        console.error("PROFILE LOAD ERROR:", error);
      }
    });

    return () => unsubscribe();
  }, []);

  const score = pw.length >= 12 ? 4 : pw.length >= 8 ? 3 : pw.length >= 5 ? 2 : pw.length ? 1 : 0;
  const strengthColor = ["bg-danger", "bg-danger", "bg-warning", "bg-info", "bg-success"][score];

  return (
    <AppLayout>
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Left profile card */}
        <div className="card-surface p-6">
          <div className="flex flex-col items-center text-center">
            <Avatar className="h-20 w-20">
              <AvatarFallback className="bg-primary-tint text-primary text-xl font-bold">
                {initialsOf(profile.name) ?? <User size={28} />}
              </AvatarFallback>
            </Avatar>
            <h2 className="mt-4 font-display text-lg font-bold text-foreground">
              {profile.name || "Your name"}
            </h2>
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-primary-tint px-2 py-0.5 text-xs font-medium text-primary">
              <Shield size={11} /> {profile.role || "No role set"}
            </span>
            <div className="mt-5 w-full space-y-3 text-left">
              <ProfileRow icon={Mail} label="Email" value={profile.email || "—"} />
              <ProfileRow
                icon={Calendar}
                label="Member since"
                value={profile.memberSince || "—"}
              />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Account form */}
          <section className="card-surface p-6">
            <h3 className="font-display text-base font-semibold text-foreground">
              Account details
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Update your name and contact information.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();

                const user = auth.currentUser;

                if (!user) {
                  toast.error("You are not logged in");
                  return;
                }

                try {
                  await updateDoc(doc(db, "users", user.uid), {
                    name: formData.name,
                    email: formData.email,
                    department: formData.department,
                    phone: formData.phone,
                  });

                  setProfile((prev) => ({
                    ...prev,
                    name: formData.name,
                    email: formData.email,
                    department: formData.department,
                    phone: formData.phone,
                  }));

                  toast.success("Profile updated");
                } catch (error) {
                  console.error("Error updating profile:", error);
                  toast.error("Failed to update profile");
                }
              }}
              className="mt-5 grid gap-4 sm:grid-cols-2"
            >
              <Field label="Full name">
                <input
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Your full name"
                  className="input-base"
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  placeholder="you@college.edu"
                  className="input-base"
                />
              </Field>
              <Field label="Department">
                <input
                  value={formData.department}
                  onChange={(e) =>
                    setFormData({ ...formData, department: e.target.value })
                  }
                  placeholder="Your department"
                  className="input-base"
                />
              </Field>
              <Field label="Phone">
                <input
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  placeholder="+91 XXXXXXXXXX"
                  className="input-base"
                />
              </Field>
              <div className="sm:col-span-2 flex justify-end">
                <button type="submit" className="btn-primary">
                  Save changes
                </button>
              </div>
            </form>
          </section>

          {/* Password form */}
          <section className="card-surface p-6">
            <h3 className="font-display text-base font-semibold text-foreground">
              Change password
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Use at least 8 characters, one uppercase, one number.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                toast.success("Password updated");
                setPw("");
              }}
              className="mt-5 space-y-4"
            >
              <Field label="Current password">
                <input type="password" className="input-base" />
              </Field>
              <Field label="New password">
                <input
                  type="password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  className="input-base"
                />
                {pw && (
                  <div className="mt-2 flex gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={cn(
                          "h-1 flex-1 rounded-full",
                          i < score ? strengthColor : "bg-border",
                        )}
                      />
                    ))}
                  </div>
                )}
              </Field>
              <Field label="Confirm new password">
                <input type="password" className="input-base" />
              </Field>
              <div className="flex justify-end">
                <button type="submit" className="btn-primary">
                  Update password
                </button>
              </div>
            </form>
          </section>

          {/* Logout */}
          <section className="card-surface flex items-center justify-between p-6">
            <div>
              <h3 className="font-display text-base font-semibold text-foreground">Sign out</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                End your current session on this device.
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  await signOut(auth);
                  window.location.href = "/";
                } catch (error) {
                  console.error("Sign out failed:", error);
                }
              }}
              className="btn-secondary"
            >
              <LogOut size={14} /> Sign out
            </button>


          </section>
        </div>
      </div>
    </AppLayout>
  );
}

function ProfileRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
      <Icon size={14} className="shrink-0 text-subtle" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-subtle">{label}</div>
        <div className="truncate text-sm text-foreground">{value}</div>
      </div>
    </div>
  );
}
