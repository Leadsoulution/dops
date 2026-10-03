import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { adAccountToken, markSynced } from "@/lib/supabase/ad-accounts";
import { toMad } from "./fx";
import { AdApiError, lastDays, type AdPlatform } from "./types";
import * as meta from "./meta";
import * as tiktok from "./tiktok";

/**
 * Releve des campagnes et des depenses, plateforme par plateforme.
 *
 * Rien n'est jamais ecrit chez Meta ni chez TikTok : on lit, on
 * convertit, on range. Les deux clients n'exposent que des GET, et ce
 * module ne fait que les appeler.
 *
 * Les lignes sont posees par-dessus les precedentes plutot qu'ajoutees :
 * une journee deja relevee se corrige d'une synchronisation a l'autre —
 * les plateformes revoient leurs chiffres pendant quelques jours — et
 * deux passages le meme jour ne doivent pas doubler la depense.
 */

/** Fenetre relue a chaque passage : les plateformes corrigent encore J-6. */
const JOURS_PAR_DEFAUT = 7;

const CLIENTS = { meta, tiktok } as const;

export type SyncResult = {
  accountId: string;
  platform: AdPlatform;
  campaigns: number;
  rows: number;
  /** Devises rencontrees sans taux connu : la depense n'est pas convertie. */
  unconvertedCurrency?: string;
  error?: string;
};

export async function syncAdAccount(
  accountId: string,
  platform: AdPlatform,
  externalId: string,
  days = JOURS_PAR_DEFAUT
): Promise<SyncResult> {
  const supabase = getSupabaseServerClient();
  const debut = Date.now();
  const { since, until } = lastDays(days);
  const client = CLIENTS[platform];

  const journal = {
    account_id: accountId,
    platform,
    trigger: "manuel",
    date_from: since,
    date_to: until,
    started_at: new Date(debut).toISOString(),
  };

  try {
    const token = await adAccountToken(accountId);
    if (!token) {
      throw new AdApiError(
        "Compte deconnecte ou jeton illisible : reconnectez-le.",
        platform
      );
    }

    // Le compte d'abord : c'est lui qui porte la devise, donc le taux.
    const info = await client.getAccount(token, externalId);

    /*
     * Les trois etages, du plus large au plus fin.
     *
     * Ils se relevent separement : aucune plateforme ne rend les
     * depenses d'un ensemble en descendant celles de sa campagne. Les
     * campagnes d'abord, parce que les ensembles s'y rattachent.
     */
    const campagnes = [
      ...(await client.getCampaigns(token, externalId)),
      ...(await client.getAdSets(token, externalId)),
      ...(await client.getAds(token, externalId)),
    ];
    if (campagnes.length > 0) {
      const { error } = await supabase.from("ad_campaigns").upsert(
        campagnes.map((c) => ({
          account_id: accountId,
          platform,
          level: c.level,
          external_id: c.externalId,
          parent_external_id: c.parentExternalId ?? null,
          name: c.name,
          status: c.status ?? null,
          objective: c.objective ?? null,
          started_at: c.startedAt ?? null,
          stopped_at: c.stoppedAt ?? null,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "platform,external_id" }
      );
      if (error) throw new Error(error.message);
    }

    // L'identifiant interne de chaque campagne, pour y rattacher les
    // depenses : la plateforme ne connait que le sien.
    const { data: connues, error: lectureError } = await supabase
      .from("ad_campaigns")
      .select("id,external_id")
      .eq("platform", platform);
    if (lectureError) throw new Error(lectureError.message);
    const parExterne = new Map(
      ((connues ?? []) as unknown as { id: string; external_id: string }[]).map(
        (c) => [c.external_id, c.id]
      )
    );

    const insights = [
      ...(await client.getInsights(token, externalId, since, until, "campaign")),
      ...(await client.getInsights(token, externalId, since, until, "adset")),
      ...(await client.getInsights(token, externalId, since, until, "ad")),
    ];

    let devisePerdue: string | undefined;
    const lignes = insights
      .map((i) => {
        const campaignId = parExterne.get(i.campaignExternalId);
        // Une depense sans campagne connue n'a nulle part ou aller : la
        // campagne a ete creee entre les deux appels, elle sera la au
        // prochain passage.
        if (!campaignId) return null;

        const { mad, rate, unknownCurrency } = toMad(i.spend, info.currency);
        if (unknownCurrency) devisePerdue = info.currency;

        return {
          account_id: accountId,
          campaign_id: campaignId,
          platform,
          level: i.level,
          day: i.day,
          spend: i.spend,
          currency: info.currency,
          fx_rate: rate,
          spend_mad: mad,
          impressions: i.impressions,
          clicks: i.clicks,
          conversions: i.conversions,
          // Tout ce que la plateforme a renvoye en plus, tel quel.
          metrics: i.metrics ?? null,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      })
      .filter((l) => l !== null);

    if (lignes.length > 0) {
      const { error } = await supabase
        .from("ad_insights_daily")
        .upsert(lignes, { onConflict: "campaign_id,day" });
      if (error) throw new Error(error.message);
    }

    // L'echec du journal ne doit pas faire echouer la relevee, mais il
    // ne doit pas passer inapercu non plus : une relevee sans trace
    // est une relevee qu'on ne saura pas expliquer.
    const { error: journalError } = await supabase.from("ad_sync_logs").insert({
      ...journal,
      status: "Succes",
      rows_written: lignes.length,
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - debut,
    });
    if (journalError) console.error("ad_sync_logs:", journalError.message);
    await markSynced(accountId);

    return {
      accountId,
      platform,
      campaigns: campagnes.length,
      rows: lignes.length,
      unconvertedCurrency: devisePerdue,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inattendue.";
    await supabase.from("ad_sync_logs").insert({
      ...journal,
      status: "Echec",
      error: message,
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - debut,
    });
    await markSynced(accountId, message);
    return { accountId, platform, campaigns: 0, rows: 0, error: message };
  }
}

/**
 * Verifie un jeton avant de l'enregistrer, en lisant le compte.
 *
 * Accepter un jeton sans l'essayer donnerait un compte "Actif" qui
 * echoue a chaque synchronisation, et l'erreur n'apparaitrait qu'une
 * heure plus tard, loin du formulaire qui l'a causee.
 */
export async function verifyAdAccount(
  platform: AdPlatform,
  externalId: string,
  token: string
) {
  return CLIENTS[platform].getAccount(token, externalId);
}
