import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { UploadCenterClient } from "./UploadCenterClient";

export default async function UploadCenterPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") redirect("/dashboard");
  return <UploadCenterClient />;
}
