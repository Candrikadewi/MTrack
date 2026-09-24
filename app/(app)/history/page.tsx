import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { HistoryPageClient } from "./HistoryPageClient";

export default async function HistoryPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role === "guest") redirect("/dashboard");
  return <HistoryPageClient />;
}
