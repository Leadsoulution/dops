import "server-only";
import {
  AdApiError,
  type AdAccountInfo,
  type AdCampaignInfo,
  type AdInsightRow,
} from "./types";

/**
 * Meta Marketing API, en lecture seule.
 *
 * Aucune fonction de ce module n'ecrit : toutes les requetes sont des
 * GET, et rien n'appelle POST ni DELETE. Une campagne ne peut donc pas
 * etre modifiee, creee ni mise en pause depuis l'application — meme par
 * erreur, meme si le jeton en donnait le droit.
 *
 * Le jeton attendu porte la seule permission `ads_read`.
 */

const VERSION = "v21.0";
const BASE = `https://graph.facebook.com/${VERSION}`;

/** Au-dela, Meta refuse la page et demande de reduire. */
const PAGE_SIZE = 200;

/** Garde-fou : une pagination qui ne finit pas est une boucle, pas un chargement. */
const MAX_PAGES = 30;

type MetaError = {
  error?: { message?: string; code?: number; error_subcode?: number };
};

async function get<T>(path: string, token: string, params: Record<string, string>) {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new AdApiError("Meta injoignable.", "meta");
  }

  const body = (await res.json().catch(() => ({}))) as T & MetaError;
  if (!res.ok || body.error) {
    const code = body.error?.code;
    // 4, 17 et 613 disent tous "trop de requetes" : ce n'est pas une
    // panne, c'est une invitation a revenir plus tard.
    const rateLimited = code === 4 || code === 17 || code === 613;
    throw new AdApiError(
      body.error?.message ?? `Meta a repondu ${res.status}.`,
      "meta",
      rateLimited
    );
  }
  return body;
}

/** Meta pagine par curseur ; on suit `paging.next` jusqu'au bout. */
async function getAll<T>(
  path: string,
  token: string,
  params: Record<string, string>
): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const body = await get<{
      data?: T[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>(path, token, {
      ...params,
      limit: String(PAGE_SIZE),
      ...(after ? { after } : {}),
    });

    out.push(...(body.data ?? []));
    if (!body.paging?.next) break;
    after = body.paging.cursors?.after;
    if (!after) break;
  }
  return out;
}

/** "act_123" ou "123" : Meta veut le prefixe, on le pose si besoin. */
function accountPath(externalId: string): string {
  return externalId.startsWith("act_") ? externalId : `act_${externalId}`;
}

export async function getAccount(
  token: string,
  externalId: string
): Promise<AdAccountInfo> {
  const a = await get<{ name?: string; currency?: string; timezone_name?: string }>(
    `/${accountPath(externalId)}`,
    token,
    { fields: "name,currency,timezone_name" }
  );
  return {
    externalId: accountPath(externalId),
    name: a.name ?? externalId,
    currency: a.currency ?? "USD",
    timezone: a.timezone_name,
  };
}

export async function getCampaigns(
  token: string,
  externalId: string
): Promise<AdCampaignInfo[]> {
  const rows = await getAll<{
    id: string;
    name?: string;
    status?: string;
    objective?: string;
    start_time?: string;
    stop_time?: string;
  }>(`/${accountPath(externalId)}/campaigns`, token, {
    fields: "id,name,status,objective,start_time,stop_time",
    // Les campagnes supprimees restent dans les depenses passees : les
    // ecarter ici laisserait des lignes orphelines dans le journal.
    effective_status: '["ACTIVE","PAUSED","ARCHIVED","DELETED"]',
  });

  return rows.map((c) => ({
    externalId: c.id,
    level: "campaign" as const,
    name: c.name ?? c.id,
    status: c.status,
    objective: c.objective,
    startedAt: c.start_time,
    stoppedAt: c.stop_time,
  }));
}

/**
 * Les depenses jour par jour, au niveau campagne.
 *
 * `time_increment=1` demande une ligne par journee plutot qu'un total :
 * sans lui, resynchroniser une semaine ecraserait sept jours par un
 * seul chiffre.
 */
export async function getInsights(
  token: string,
  externalId: string,
  since: string,
  until: string
): Promise<AdInsightRow[]> {
  const rows = await getAll<{
    campaign_id?: string;
    date_start?: string;
    spend?: string;
    impressions?: string;
    clicks?: string;
    actions?: { action_type: string; value: string }[];
  }>(`/${accountPath(externalId)}/insights`, token, {
    level: "campaign",
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    fields: "campaign_id,spend,impressions,clicks,actions",
  });

  return rows
    .filter((r) => r.campaign_id && r.date_start)
    .map((r) => ({
      campaignExternalId: r.campaign_id!,
      level: "campaign" as const,
      day: r.date_start!,
      spend: Number(r.spend ?? 0),
      impressions: Number(r.impressions ?? 0),
      clicks: Number(r.clicks ?? 0),
      conversions: countLeads(r.actions),
    }));
}

/**
 * Ce que Meta appelle une conversion depend de l'objectif : un
 * formulaire rempli, un achat, un message. On additionne les trois
 * familles qui correspondent a une commande en paiement a la livraison,
 * et rien d'autre — compter les clics sur le lien gonflerait le chiffre
 * sans rien dire.
 */
function countLeads(actions?: { action_type: string; value: string }[]): number {
  if (!actions) return 0;
  const retenus = new Set([
    "lead",
    "onsite_conversion.lead_grouped",
    "offsite_conversion.fb_pixel_lead",
    "offsite_conversion.fb_pixel_purchase",
    "purchase",
  ]);
  return actions
    .filter((a) => retenus.has(a.action_type))
    .reduce((total, a) => total + Number(a.value ?? 0), 0);
}
