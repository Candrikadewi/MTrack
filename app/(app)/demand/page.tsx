import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { DemandPageClient } from "./DemandPageClient";

export default async function DemandPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role === "guest") redirect("/dashboard");
  return <DemandPageClient />;
}
