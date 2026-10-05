/**
 * Ce que les deux plateformes ont en commun.
 *
 * Meta et TikTok nomment tout differemment — ad set contre ad group,
 * `spend` contre `spend`, mais `stat_time_day` contre `date_start`. Les
 * ramener a une seule forme ici evite que ces differences remontent
 * jusqu'a l'ecran.
 */

import { moroccoDate, moroccoDateShift } from "@/lib/morocco-day";

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
  /**
   * Toutes les autres mesures de la plateforme, telles quelles :
   * couverture, frequence, clics uniques, resultats par type d'action.
   * Les taux n'y sont pas ranges — ils se recalculent, ils ne se
   * transportent pas.
   */
  metrics?: Record<string, number>;
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

/**
 * Les derniers jours, bornes comprises, au format des deux API.
 *
 * Les journees sont celles du Maroc, pas celles d'UTC. Le serveur
 * tourne en UTC : passe minuit a Casablanca, il demandait encore les
 * depenses de la veille, et celles du jour n'apparaissaient qu'apres
 * une heure du matin.
 */
export function lastDays(count: number, today: Date = new Date()) {
  const fin = moroccoDate(today);
  return { since: moroccoDateShift(fin, -(count - 1)), until: fin };
}
