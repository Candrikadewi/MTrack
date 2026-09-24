import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { ProjectsPageClient } from "./ProjectsPageClient";

export default async function ProjectsPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role === "guest") redirect("/dashboard");
  return <ProjectsPageClient />;
}
