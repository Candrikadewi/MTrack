import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { TaktPageClient } from "./TaktPageClient";

export default async function TaktPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role === "guest") redirect("/dashboard");
  return <TaktPageClient />;
}
