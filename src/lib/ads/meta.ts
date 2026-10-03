import "server-only";
import {
  AdApiError,
  type AdAccountInfo,
  type AdCampaignInfo,
  type AdInsightRow,
  type AdLevel,
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

    /*
     * Le message de Meta seul ne suffit pas a reparer.
     *
     * "Invalid parameter" est renvoye pour une douzaine de causes
     * differentes, et sans savoir quel appel l'a provoque il faut
     * deviner. On garde donc le chemin et les codes : ce sont eux
     * qu'on cite au support, et eux qui designent la ligne fautive.
     */
    const details = [
      code !== undefined ? `code ${code}` : null,
      body.error?.error_subcode ? `sous-code ${body.error.error_subcode}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    const message = body.error?.message ?? `Meta a repondu ${res.status}.`;
    throw new AdApiError(
      `${path} — ${message}${details ? ` (${details})` : ""}`,
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
    /*
     * Les campagnes archivees restent demandees : leurs depenses
     * passees figurent dans les releves, et les ecarter ici laisserait
     * des lignes orphelines dans le journal.
     *
     * "DELETED" en revanche a ete retire. Meta le refuse dans ce
     * filtre et repond "Invalid parameter", ce qui faisait echouer
     * tout le relevee avant meme d'arriver aux depenses.
     */
    effective_status: '["ACTIVE","PAUSED","ARCHIVED"]',
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
 * Les ensembles de publicites, rattaches a leur campagne.
 *
 * C'est a cet etage que se decident le ciblage et le budget : une
 * campagne qui coute cher sans vendre se repare presque toujours en
 * regardant lequel de ses ensembles mange le budget.
 */
export async function getAdSets(
  token: string,
  externalId: string
): Promise<AdCampaignInfo[]> {
  const rows = await getAll<{
    id: string;
    name?: string;
    status?: string;
    campaign_id?: string;
    start_time?: string;
    end_time?: string;
  }>(`/${accountPath(externalId)}/adsets`, token, {
    fields: "id,name,status,campaign_id,start_time,end_time",
    effective_status: '["ACTIVE","PAUSED","ARCHIVED"]',
  });

  return rows.map((a) => ({
    externalId: a.id,
    level: "adset" as const,
    parentExternalId: a.campaign_id,
    name: a.name ?? a.id,
    status: a.status,
    startedAt: a.start_time,
    stoppedAt: a.end_time,
  }));
}

/** Les publicites elles-memes, rattachees a leur ensemble. */
export async function getAds(
  token: string,
  externalId: string
): Promise<AdCampaignInfo[]> {
  const rows = await getAll<{
    id: string;
    name?: string;
    status?: string;
    adset_id?: string;
    created_time?: string;
  }>(`/${accountPath(externalId)}/ads`, token, {
    fields: "id,name,status,adset_id,created_time",
    effective_status: '["ACTIVE","PAUSED","ARCHIVED"]',
  });

  return rows.map((a) => ({
    externalId: a.id,
    level: "ad" as const,
    parentExternalId: a.adset_id,
    name: a.name ?? a.id,
    status: a.status,
    startedAt: a.created_time,
  }));
}

/**
 * Les depenses jour par jour, a l'etage demande.
 *
 * `time_increment=1` demande une ligne par journee plutot qu'un total :
 * sans lui, resynchroniser une semaine ecraserait sept jours par un
 * seul chiffre.
 *
 * Les trois etages se relevent separement. Meta ne rend pas les
 * depenses d'un ensemble en descendant celles de sa campagne : un
 * total de campagne ne se repartit pas, il faut le redemander.
 */
const ID_FIELD: Record<AdLevel, string> = {
  campaign: "campaign_id",
  adset: "adset_id",
  ad: "ad_id",
};

/** Les mesures simples, demandees telles quelles. */
const CHAMPS_SIMPLES = [
  "spend",
  "reach",
  "impressions",
  "clicks",
  "unique_clicks",
  "inline_link_clicks",
];

/** Les mesures livrees sous forme de liste d'actions. */
const CHAMPS_ACTIONS = [
  "actions",
  "outbound_clicks",
  "video_p25_watched_actions",
  "video_p100_watched_actions",
];

/**
 * Le resultat, tel que Meta le compte.
 *
 * C'est la colonne la plus utile de leur tableau, et la seule qu'on ne
 * saurait pas recalculer : le "resultat" d'une campagne depend de ce
 * qu'elle optimise. Une campagne de vente compte des achats, une
 * campagne d'engagement compte des interactions, une autre des visites
 * de profil. Meta nomme cet indicateur dans sa reponse ; on le garde
 * avec le chiffre, pour que l'ecran puisse dire de quoi il parle.
 *
 * Il porte aussi la fenetre d'attribution du compte, que les listes
 * `actions` n'appliquent pas : c'est pourquoi ce champ affiche des
 * achats la ou `actions` n'en montre aucun.
 */
const CHAMPS_RESULTATS = ["results"];

type ResultList = {
  indicator?: string;
  values?: { value?: string }[];
}[];

/** Prefixe des resultats, l'indicateur collant a la cle. */
export const RESULT_PREFIX = "result:";

type ActionList = { action_type: string; value: string }[];

export async function getInsights(
  token: string,
  externalId: string,
  since: string,
  until: string,
  level: AdLevel = "campaign"
): Promise<AdInsightRow[]> {
  const champ = ID_FIELD[level];
  const rows = await getAll<
    Record<string, string | ActionList | ResultList | undefined> & {
      date_start?: string;
    }
  >(`/${accountPath(externalId)}/insights`, token, {
    level,
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    /*
     * On ne demande que les mesures brutes, pas les taux.
     *
     * Meta renvoie volontiers ctr, cpc et frequence, mais ce sont des
     * rapports calcules sur la journee. Les enregistrer puis les
     * additionner sur une semaine donnerait n'importe quoi ; on les
     * recalcule a l'affichage depuis leurs deux termes.
     */
    fields: [
      champ,
      ...CHAMPS_SIMPLES,
      ...CHAMPS_ACTIONS,
      ...CHAMPS_RESULTATS,
    ].join(","),
  });

  return rows
    .filter((r) => r[champ] && r.date_start)
    .map((r) => {
      const metrics: Record<string, number> = {};

      for (const c of CHAMPS_SIMPLES) {
        const n = Number(r[c] ?? 0);
        if (Number.isFinite(n) && n !== 0) metrics[c] = n;
      }

      // Les quartiles video arrivent en liste d'une seule entree.
      for (const [champVideo, cle] of [
        ["video_p25_watched_actions", "video_p25"],
        ["video_p100_watched_actions", "video_p100"],
      ] as const) {
        const total = somme(r[champVideo] as ActionList | undefined);
        if (total) metrics[cle] = total;
      }

      for (const a of (r.actions as ActionList | undefined) ?? []) {
        metrics[`action:${a.action_type}`] = Number(a.value ?? 0);
      }
      for (const a of (r.outbound_clicks as ActionList | undefined) ?? []) {
        metrics.outbound_clicks = Number(a.value ?? 0);
      }

      /*
       * Le resultat, range sous son indicateur. Deux campagnes qui
       * n'optimisent pas la meme chose gardent ainsi des colonnes
       * distinctes, et leur total se nomme "plusieurs conversions"
       * comme chez Meta, au lieu d'additionner des achats avec des
       * visites de profil.
       */
      for (const res of (r.results as unknown as ResultList | undefined) ?? []) {
        const valeur = Number(res.values?.[0]?.value ?? 0);
        if (!res.indicator || !valeur) continue;
        const cle = `${RESULT_PREFIX}${res.indicator.replace(/^actions:/, "")}`;
        metrics[cle] = (metrics[cle] ?? 0) + valeur;
      }

      return {
        campaignExternalId: r[champ] as string,
        level,
        day: r.date_start!,
        spend: Number(r.spend ?? 0),
        impressions: Number(r.impressions ?? 0),
        clicks: Number(r.clicks ?? 0),
        conversions: countLeads(r.actions as ActionList | undefined),
        metrics,
      };
    });
}

function somme(list?: ActionList): number {
  return (list ?? []).reduce((t, a) => t + Number(a.value ?? 0), 0);
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
