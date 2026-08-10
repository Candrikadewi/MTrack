import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { SupplyDemandPageClient } from "./SupplyDemandPageClient";

export default async function SupplyDemandPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role === "guest") redirect("/dashboard");
  return <SupplyDemandPageClient />;
}
