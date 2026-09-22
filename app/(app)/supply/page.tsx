import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { SupplyPageClient } from "./SupplyPageClient";

export default async function SupplyPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role === "guest") redirect("/dashboard");
  return <SupplyPageClient />;
}
