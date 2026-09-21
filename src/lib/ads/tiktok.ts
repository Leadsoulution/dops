import "server-only";
import {
  AdApiError,
  type AdAccountInfo,
  type AdCampaignInfo,
  type AdInsightRow,
} from "./types";

/**
 * TikTok Business API, en lecture seule.
 *
 * Meme regle que pour Meta : uniquement des GET, aucune ecriture. Le
 * jeton attendu ne porte que le droit de rapport.
 *
 * Particularite de TikTok : le code HTTP est presque toujours 200, et
 * l'echec se lit dans le champ `code` du corps. Se fier au statut HTTP
 * seul ferait passer une erreur pour un succes vide.
 */

const BASE = "https://business-api.tiktok.com/open_api/v1.3";
const PAGE_SIZE = 200;
const MAX_PAGES = 30;

/** Le code que TikTok renvoie quand on l'interroge trop vite. */
const RATE_LIMIT_CODES = new Set([40100, 50002]);

type TikTokBody<T> = { code?: number; message?: string; data?: T };

async function get<T>(
  path: string,
  token: string,
  params: Record<string, string>
): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "Access-Token": token },
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new AdApiError("TikTok injoignable.", "tiktok");
  }

  const body = (await res.json().catch(() => ({}))) as TikTokBody<T>;
  // 0 est le seul code qui vaut succes chez TikTok.
  if (!res.ok || (body.code ?? 0) !== 0) {
    throw new AdApiError(
      body.message ?? `TikTok a repondu ${res.status}.`,
      "tiktok",
      RATE_LIMIT_CODES.has(body.code ?? 0)
    );
  }
  return (body.data ?? {}) as T;
}

/** TikTok pagine par numero de page, avec le total en retour. */
async function getAll<T>(
  path: string,
  token: string,
  params: Record<string, string>
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await get<{
      list?: T[];
      page_info?: { total_page?: number };
    }>(path, token, { ...params, page: String(page), page_size: String(PAGE_SIZE) });

    out.push(...(data.list ?? []));
    if (page >= (data.page_info?.total_page ?? 1)) break;
  }
  return out;
}

export async function getAccount(
  token: string,
  advertiserId: string
): Promise<AdAccountInfo> {
  const data = await get<{
    list?: { advertiser_id: string; advertiser_name?: string; currency?: string; timezone?: string }[];
  }>("/advertiser/info/", token, {
    advertiser_ids: JSON.stringify([advertiserId]),
    fields: JSON.stringify(["advertiser_id", "advertiser_name", "currency", "timezone"]),
  });

  const a = data.list?.[0];
  if (!a) throw new AdApiError("Compte TikTok introuvable.", "tiktok");
  return {
    externalId: a.advertiser_id,
    name: a.advertiser_name ?? advertiserId,
    currency: a.currency ?? "USD",
    timezone: a.timezone,
  };
}

export async function getCampaigns(
  token: string,
  advertiserId: string
): Promise<AdCampaignInfo[]> {
  const rows = await getAll<{
    campaign_id: string;
    campaign_name?: string;
    operation_status?: string;
    secondary_status?: string;
    objective_type?: string;
    create_time?: string;
  }>("/campaign/get/", token, { advertiser_id: advertiserId });

  return rows.map((c) => ({
    externalId: c.campaign_id,
    level: "campaign" as const,
    name: c.campaign_name ?? c.campaign_id,
    // `operation_status` dit ENABLE/DISABLE, `secondary_status` detaille
    // le refus ou la fin de budget. Le second est plus parlant quand il
    // existe.
    status: c.secondary_status ?? c.operation_status,
    objective: c.objective_type,
    startedAt: c.create_time,
  }));
}

/**
 * Les depenses jour par jour.
 *
 * `stat_time_day` dans les dimensions est ce qui decoupe par journee :
 * sans lui, TikTok renvoie un total sur la periode, et resynchroniser
 * une semaine ecraserait sept jours par un seul chiffre.
 */
export async function getInsights(
  token: string,
  advertiserId: string,
  since: string,
  until: string
): Promise<AdInsightRow[]> {
  const rows = await getAll<{
    dimensions?: { campaign_id?: string; stat_time_day?: string };
    metrics?: Record<string, string | number>;
  }>("/report/integrated/get/", token, {
    advertiser_id: advertiserId,
    report_type: "BASIC",
    data_level: "AUCTION_CAMPAIGN",
    dimensions: JSON.stringify(["campaign_id", "stat_time_day"]),
    metrics: JSON.stringify(["spend", "impressions", "clicks", "conversion"]),
    start_date: since,
    end_date: until,
  });

  return rows
    .filter((r) => r.dimensions?.campaign_id && r.dimensions?.stat_time_day)
    .map((r) => ({
      campaignExternalId: r.dimensions!.campaign_id!,
      level: "campaign" as const,
      // TikTok rend "2026-09-21 00:00:00" : seule la date nous interesse.
      day: r.dimensions!.stat_time_day!.slice(0, 10),
      spend: Number(r.metrics?.spend ?? 0),
      impressions: Number(r.metrics?.impressions ?? 0),
      clicks: Number(r.metrics?.clicks ?? 0),
      conversions: Number(r.metrics?.conversion ?? 0),
    }));
}
