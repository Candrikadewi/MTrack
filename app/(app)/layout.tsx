import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { RoleProvider } from "@/lib/RoleContext";
import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { ToastHost } from "@/components/ui/ToastHost";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  return (
    <RoleProvider role={profile.role}>
      <ToastHost />
      <Sidebar role={profile.role} email={profile.email} />
      <div className="flex min-h-screen flex-col md:pl-64">
        <MobileNav role={profile.role} />
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </RoleProvider>
  );
}
