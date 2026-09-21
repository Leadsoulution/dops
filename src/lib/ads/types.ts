/**
 * Ce que les deux plateformes ont en commun.
 *
 * Meta et TikTok nomment tout differemment — ad set contre ad group,
 * `spend` contre `spend`, mais `stat_time_day` contre `date_start`. Les
 * ramener a une seule forme ici evite que ces differences remontent
 * jusqu'a l'ecran.
 */

export type AdPlatform = "meta" | "tiktok";

/** Les trois etages d'un compte publicitaire, du plus large au plus fin. */
export type AdLevel = "campaign" | "adset" | "ad";

export type AdAccountInfo = {
  externalId: string;
  name: string;
  /** Devise du compte : c'est elle qui decide s'il faut convertir. */
  currency: string;
  timezone?: string;
};

export type AdCampaignInfo = {
  externalId: string;
  level: AdLevel;
  /** Nul pour une campagne, qui n'a rien au-dessus d'elle. */
  parentExternalId?: string;
  name: string;
  /** Statut tel que la plateforme le formule, jamais traduit. */
  status?: string;
  objective?: string;
  startedAt?: string;
  stoppedAt?: string;
};

export type AdInsightRow = {
  campaignExternalId: string;
  level: AdLevel;
  /** Jour au format AAAA-MM-JJ, dans le fuseau du compte. */
  day: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
};

/**
 * Une panne de plateforme, dite telle quelle.
 *
 * Le message n'est pas traduit : c'est lui qu'il faudra citer au
 * support, et une reformulation ferait perdre le code d'erreur.
 */
export class AdApiError extends Error {
  constructor(
    message: string,
    readonly platform: AdPlatform,
    /** Vrai quand la plateforme demande d'attendre plutot que de renoncer. */
    readonly rateLimited = false
  ) {
    super(message);
    this.name = "AdApiError";
  }
}

/** Les sept derniers jours, bornes comprises, au format des deux API. */
export function lastDays(count: number, today: Date = new Date()) {
  const jour = (d: Date) => d.toISOString().slice(0, 10);
  const debut = new Date(today);
  debut.setUTCDate(debut.getUTCDate() - (count - 1));
  return { since: jour(debut), until: jour(today) };
}
