import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { HandoverClient } from "./HandoverClient";

export default async function HandoverPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") redirect("/dashboard");
  return <HandoverClient />;
}
