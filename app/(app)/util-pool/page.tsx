import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { UtilPoolPageClient } from "./UtilPoolPageClient";

export default async function UtilPoolPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role === "guest") redirect("/dashboard");
  return <UtilPoolPageClient />;
}
