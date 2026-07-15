import { createClient } from "@/lib/supabase/server";
import type { Role } from "./roles";

export type { Role } from "./roles";
export { canAccessModule } from "./roles";

export interface Profile {
  id: string;
  email: string;
  role: Role;
  display_name: string | null;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!data) return null;
  return data as Profile;
}
