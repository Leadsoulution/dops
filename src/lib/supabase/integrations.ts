import "server-only";
import { getSupabaseServerClient, isSupabaseServerConfigured } from "./server";

/**
 * Reglages d'une integration, enregistres depuis l'application.
 *
 * `server-only` n'est pas decoratif : ce module lit des identifiants de
 * boutique, et une importation accidentelle depuis un composant client
 * les enverrait au navigateur. L'import echoue alors a la compilation.
 */

export async function getIntegrationSettings<T extends Record<string, string>>(
  id: string
): Promise<Partial<T>> {
  if (!isSupabaseServerConfigured) return {};
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("integration_settings")
    .select("settings")
    .eq("id", id)
    .maybeSingle();
  return ((data as { settings: Partial<T> } | null)?.settings ?? {}) as Partial<T>;
}

export async function saveIntegrationSettings(
  id: string,
  settings: Record<string, string>
): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("integration_settings")
    .upsert(
      { id, settings, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );
  if (error) throw new Error(error.message);
}
