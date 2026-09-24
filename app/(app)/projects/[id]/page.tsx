import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { ProjectDetailPageClient } from "./ProjectDetailPageClient";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role === "guest") redirect("/dashboard");
  const { id } = await params;
  return <ProjectDetailPageClient id={id} />;
}
