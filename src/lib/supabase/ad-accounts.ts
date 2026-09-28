import "server-only";
import { getSupabaseServerClient } from "./server";
import { decryptToken, encryptToken, tokenHint } from "@/lib/ads/crypto";
import type { AdAccountInfo, AdPlatform } from "@/lib/ads/types";

/**
 * Les comptes publicitaires branches sur l'application.
 *
 * Le jeton ne sort jamais d'ici. Ce module est le seul a le dechiffrer,
 * et il ne rend au reste de l'application qu'une empreinte — les quatre
 * derniers caracteres — qui suffit a reconnaitre un jeton sans
 * permettre de s'en servir.
 *
 * Un compte n'est jamais supprime. Le deconnecter le passe en
 * "Suspendu" et efface son jeton : les depenses deja enregistrees
 * gardent ainsi le compte qui les a produites, et l'historique ne se
 * troue pas parce qu'on a debranche une source.
 */

export const ACTIF = "Actif";
export const SUSPENDU = "Suspendu";

/** Ce que le navigateur a le droit de savoir d'un compte. */
export type AdAccountView = {
  id: string;
  platform: AdPlatform;
  externalId: string;
  name: string;
  currency: string;
  timezone?: string;
  status: string;
  /** "****abcd", ou rien quand le compte est deconnecte. */
  tokenHint?: string;
  lastSyncAt?: string;
  lastSyncError?: string;
};

type Row = {
  id: string;
  platform: AdPlatform;
  external_id: string;
  name: string;
  currency: string;
  timezone: string | null;
  status: string;
  access_token_cipher: string | null;
  last_sync_at: string | null;
  last_sync_error: string | null;
};

const CHAMPS =
  "id,platform,external_id,name,currency,timezone,status," +
  "access_token_cipher,last_sync_at,last_sync_error";

function toView(row: Row): AdAccountView {
  const token = decryptToken(row.access_token_cipher);
  return {
    id: row.id,
    platform: row.platform,
    externalId: row.external_id,
    name: row.name,
    currency: row.currency,
    timezone: row.timezone ?? undefined,
    status: row.status,
    tokenHint: token ? tokenHint(token) : undefined,
    lastSyncAt: row.last_sync_at ?? undefined,
    lastSyncError: row.last_sync_error ?? undefined,
  };
}

export async function listAdAccounts(): Promise<AdAccountView[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("ad_accounts")
    .select(CHAMPS)
    .order("platform", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Row[]).map(toView);
}

/**
 * Le jeton en clair d'un compte, pour le serveur seul.
 *
 * Rend `null` quand le compte est suspendu ou quand le dechiffrement
 * echoue — une cle changee, une ligne abimee. L'appelant traduit cela
 * par "compte a reconnecter", jamais par une page en erreur.
 */
export async function adAccountToken(id: string): Promise<string | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("ad_accounts")
    .select("status,access_token_cipher")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.status !== ACTIF) return null;
  return decryptToken(data.access_token_cipher);
}

/**
 * Branche un compte, ou rebranche celui qui existe deja.
 *
 * Reconnecter ne cree pas une seconde ligne : la paire
 * plateforme + identifiant est unique, et c'est ce qui permet a un
 * compte suspendu de retrouver ses campagnes et ses depenses passees
 * des qu'on lui redonne un jeton.
 */
export async function connectAdAccount(
  platform: AdPlatform,
  info: AdAccountInfo,
  token: string
): Promise<AdAccountView> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("ad_accounts")
    .upsert(
      {
        platform,
        external_id: info.externalId,
        name: info.name,
        currency: info.currency,
        timezone: info.timezone ?? null,
        status: ACTIF,
        access_token_cipher: encryptToken(token),
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "platform,external_id" }
    )
    .select(CHAMPS)
    .single();
  if (error) throw new Error(error.message);
  return toView(data as unknown as Row);
}

/**
 * Debranche un compte sans rien effacer d'autre que son jeton.
 *
 * Les depenses, les campagnes et les journaux restent : ils racontent
 * une periode qui a bien eu lieu, et les supprimer fausserait tous les
 * totaux passes.
 */
export async function disconnectAdAccount(id: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("ad_accounts")
    .update({
      status: SUSPENDU,
      access_token_cipher: null,
      refresh_token_cipher: null,
      token_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Note le resultat d'une synchronisation sur le compte lui-meme. */
export async function markSynced(id: string, error?: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  await supabase
    .from("ad_accounts")
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_error: error ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}
