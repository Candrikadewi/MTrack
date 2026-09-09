import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { TaktDownDetailPageClient } from "./TaktDownDetailPageClient";

export default async function TaktDownDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role === "guest") redirect("/dashboard");
  const { id } = await params;
  return <TaktDownDetailPageClient id={id} />;
}
