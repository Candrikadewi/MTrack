import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { ErrorLogClient } from "./ErrorLogClient";

export default async function ErrorLogPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") redirect("/dashboard");
  return <ErrorLogClient />;
}
