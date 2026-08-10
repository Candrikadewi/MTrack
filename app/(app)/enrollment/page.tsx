import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { EnrollmentPageClient } from "./EnrollmentPageClient";

export default async function EnrollmentPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role === "guest") redirect("/dashboard");
  return <EnrollmentPageClient />;
}
