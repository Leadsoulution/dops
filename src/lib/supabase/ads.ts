import "server-only";
import { getSupabaseServerClient } from "./server";
import { fetchAll } from "./page";
import { amountValue, roundToTen } from "@/lib/amount";
import { SPEND_KEY, SPEND_SOURCE_KEY, sumMetrics } from "@/lib/ads/metrics";

/**
 * Le rapprochement entre ce qui est depense et ce qui est vendu.
 *
 * La depense vient des plateformes, les commandes viennent d'ici. Ce
 * sont deux mondes qui ne se parlent pas : Meta compte des clics
 * attribues, nous comptons des colis remis. L'ecart entre les deux est
 * precisement ce qu'un vendeur en paiement a la livraison a besoin de
 * voir — une campagne peut afficher cent conversions et ne produire que
 * trente livraisons payees.
 *
 * Le rapprochement se fait au niveau de l'ensemble, pas par campagne :
 * aucune commande ne porte l'identifiant de la campagne qui l'a
 * amenee. Attribuer une livraison a une campagne precise demanderait
 * que la page d'atterrissage transmette les parametres UTM, ce qu'elle
 * ne fait pas. Diviser la depense au prorata donnerait un chiffre
 * d'apparence precise et sans fondement : mieux vaut un total vrai
 * qu'un detail invente.
 */

const CONFIRMED = new Set(["Confirme", "EXPIDER"]);
const DELIVERED = "DELIVERED";

export type CampaignRow = {
  id: string;
  platform: "meta" | "tiktok";
  externalId: string;
  /** Campagne, ensemble de publicites, ou publicite. */
  level: "campaign" | "adset" | "ad";
  /** L'etage du dessus, par son identifiant de plateforme. */
  parentExternalId?: string;
  name: string;
  status?: string;
  spendMad: number;
  impressions: number;
  clicks: number;
  conversions: number;
  /** Clics pour cent impressions. */
  ctr: number;
  /** Cout d'un clic. */
  cpc: number;
  /** Cout de mille impressions. */
  cpm: number;
  /**
   * Les autres mesures, deja sommees pour cette ligne. Les taux n'y
   * sont pas : ils se recalculent a l'affichage.
   */
  metrics: Record<string, number>;
};

export type AdsOverview = {
  /** Cote plateformes. */
  spendMad: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpc: number;
  cpm: number;

  /** Cote commandes, les notres. */
  leads: number;
  confirmed: number;
  delivered: number;
  revenueDelivered: number;
  confirmRate: number;
  deliveryRate: number;

  /** Les deux mis face a face. */
  costPerLead: number;
  costPerConfirmed: number;
  costPerDelivered: number;
  roas: number;

  campaigns: CampaignRow[];
  /** Devise des comptes relevees, pour nommer la colonne de depense. */
  currency?: string;
  /** Depense et livraisons par jour, pour la courbe. */
  daily: { day: string; spendMad: number; delivered: number }[];
  lastSyncAt?: string;
};

type InsightRow = {
  campaign_id: string;
  day: string;
  spend_mad: string | number;
  spend: string | number;
  currency: string | null;
  impressions: number;
  clicks: number;
  conversions: string | number;
  metrics: Record<string, number> | null;
  synced_at: string;
};

type CampaignMeta = {
  id: string;
  platform: "meta" | "tiktok";
  external_id: string;
  level: "campaign" | "adset" | "ad";
  parent_external_id: string | null;
  name: string;
  status: string | null;
};

type LeadRow = {
  created_at: string;
  status: string;
  amount: string | null;
  delivery_status_code: string | null;
  delivery_date: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
};

/** Division qui rend 0 plutot que l'infini quand le diviseur manque. */
function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

/** Deux decimales : au-dela, un cout par clic ne veut plus rien dire. */
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Les comptes de commandes, prets a rejoindre le sac de mesures. */
function commandesDe(c?: {
  orders: number;
  confirmed: number;
  delivered: number;
  revenue: number;
}): Record<string, number> {
  if (!c) return {};
  return {
    orders: c.orders,
    orders_confirmed: c.confirmed,
    orders_delivered: c.delivered,
    revenue_delivered: round2(c.revenue),
  };
}

export async function getAdsOverview(
  from?: string,
  to?: string,
  /**
   * Une seule plateforme, ou les deux quand rien n'est demande. Chaque
   * regie a son propre gestionnaire, ses propres couts et ses propres
   * usages : les melanger donnerait un CPC moyen qui ne correspond a
   * aucun des deux.
   */
  platform?: "meta" | "tiktok"
): Promise<AdsOverview> {
  const supabase = getSupabaseServerClient();

  const [insights, campaigns, leads] = await Promise.all([
    fetchAll<InsightRow>(() => {
      let q = supabase
        .from("ad_insights_daily")
        .select("campaign_id,day,spend,currency,spend_mad,impressions,clicks,conversions,metrics,synced_at");
      if (from) q = q.gte("day", from.slice(0, 10));
      if (to) q = q.lte("day", to.slice(0, 10));
      if (platform) q = q.eq("platform", platform);
      return q;
    }),
    /*
     * Les trois etages, pas seulement les campagnes. L'ecran les
     * emboite ensuite : un budget qui derape se lit a l'etage de
     * l'ensemble, et la publicite fautive est encore un cran plus bas.
     */
    fetchAll<CampaignMeta>(() => {
      let q = supabase
        .from("ad_campaigns")
        .select("id,platform,external_id,level,parent_external_id,name,status");
      if (platform) q = q.eq("platform", platform);
      return q;
    }),
    fetchAll<LeadRow>(() => {
      let q = supabase
        .from("leads")
        .select("created_at,status,amount,delivery_status_code,delivery_date,utm_campaign,utm_content");
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lte("created_at", to);
      return q;
    }),
  ]);

  // --- Cote plateformes -------------------------------------------
  const parCampagne = new Map<string, InsightRow[]>();
  for (const row of insights) {
    const list = parCampagne.get(row.campaign_id);
    if (list) list.push(row);
    else parCampagne.set(row.campaign_id, [row]);
  }

  const metaById = new Map(campaigns.map((c) => [c.id, c]));

  /*
   * Les commandes rattachees a ce qui les a amenees.
   *
   * Le lien passe par les parametres du lien publicitaire :
   * `utm_content` porte l'identifiant de la publicite, `utm_campaign`
   * celui de la campagne. Une commande qui connait sa publicite
   * connait donc aussi son ensemble et sa campagne, en remontant
   * l'arbre — alors qu'une commande qui ne connait que sa campagne
   * s'arrete la. Compter la premiere aux trois etages et la seconde au
   * seul etage du haut est ce qui permet de lire un taux de livraison
   * par ensemble sans inventer de rattachement.
   */
  const parExterne = new Map(campaigns.map((c) => [c.external_id, c]));
  const commandes = new Map<
    string,
    { orders: number; confirmed: number; delivered: number; revenue: number }
  >();

  const compte = (id: string, lead: LeadRow) => {
    const e =
      commandes.get(id) ??
      { orders: 0, confirmed: 0, delivered: 0, revenue: 0 };
    e.orders += 1;
    if (CONFIRMED.has(lead.status)) e.confirmed += 1;
    if (lead.delivery_status_code === DELIVERED) {
      e.delivered += 1;
      e.revenue += roundToTen(amountValue(lead.amount ?? undefined) ?? 0);
    }
    commandes.set(id, e);
  };

  for (const lead of leads) {
    // La publicite d'abord : c'est le rattachement le plus precis, et
    // il renseigne les trois etages d'un coup.
    const pub = lead.utm_content ? parExterne.get(lead.utm_content) : undefined;
    if (pub) {
      compte(pub.id, lead);
      const ensemble = pub.parent_external_id
        ? parExterne.get(pub.parent_external_id)
        : undefined;
      if (ensemble) {
        compte(ensemble.id, lead);
        const campagne = ensemble.parent_external_id
          ? parExterne.get(ensemble.parent_external_id)
          : undefined;
        if (campagne) compte(campagne.id, lead);
      }
      continue;
    }
    const campagne = lead.utm_campaign
      ? parExterne.get(lead.utm_campaign)
      : undefined;
    if (campagne) compte(campagne.id, lead);
  }

  const rows: CampaignRow[] = [];

  for (const [campaignId, lignes] of parCampagne) {
    const meta = metaById.get(campaignId);
    if (!meta) continue;

    const spendMad = lignes.reduce((s, l) => s + Number(l.spend_mad ?? 0), 0);
    const impressions = lignes.reduce((s, l) => s + (l.impressions ?? 0), 0);
    const clicks = lignes.reduce((s, l) => s + (l.clicks ?? 0), 0);

    rows.push({
      id: meta.id,
      platform: meta.platform,
      externalId: meta.external_id,
      level: meta.level,
      parentExternalId: meta.parent_external_id ?? undefined,
      name: meta.name,
      status: meta.status ?? undefined,
      spendMad: round2(spendMad),
      impressions,
      clicks,
      conversions: lignes.reduce((s, l) => s + Number(l.conversions ?? 0), 0),
      ctr: round2(ratio(clicks, impressions) * 100),
      cpc: round2(ratio(spendMad, clicks)),
      cpm: round2(ratio(spendMad, impressions) * 1000),
      /*
       * Les mesures des journees, sommees. `sumMetrics` ecarte les
       * taux : ils se recalculent a l'affichage depuis leurs deux
       * termes, sans quoi une semaine afficherait sept fois son CTR.
       * La depense entre dans le sac pour que les couts par action
       * trouvent leur numerateur.
       */
      metrics: {
        ...sumMetrics(lignes.map((l) => l.metrics)),
        [SPEND_KEY]: round2(spendMad),
        // La depense telle que la plateforme la facture, pour que les
        // deux ecrans affichent le meme nombre cote a cote.
        [SPEND_SOURCE_KEY]: round2(
          lignes.reduce((t, l) => t + Number(l.spend ?? 0), 0)
        ),
        ...commandesDe(commandes.get(meta.id)),
      },
    });
  }
  rows.sort((a, b) => b.spendMad - a.spendMad);

  /*
   * Les totaux ne somment que les campagnes.
   *
   * Les trois etages decrivent la meme depense vue de trois hauteurs :
   * les additionner la compterait trois fois, et la carte Depense
   * aurait annonce le triple du montant reellement paye.
   */
  const racines = rows.filter((r) => r.level === "campaign");
  const spendMad = round2(racines.reduce((s, r) => s + r.spendMad, 0));
  const impressions = racines.reduce((s, r) => s + r.impressions, 0);
  const clicks = racines.reduce((s, r) => s + r.clicks, 0);
  const conversions = racines.reduce((s, r) => s + r.conversions, 0);

  // --- Cote commandes ---------------------------------------------
  const confirmed = leads.filter((l) => CONFIRMED.has(l.status));
  const delivered = leads.filter((l) => l.delivery_status_code === DELIVERED);

  // Seule une commande remise au client a rapporte de l'argent : une
  // commande confirmee mais pas encore livree n'a rien encaisse.
  const revenueDelivered = delivered.reduce(
    (s, l) => s + roundToTen(amountValue(l.amount ?? undefined) ?? 0),
    0
  );

  // --- La courbe ---------------------------------------------------
  const jours = new Map<string, { spendMad: number; delivered: number }>();
  const pose = (jour: string) =>
    jours.get(jour) ?? (jours.set(jour, { spendMad: 0, delivered: 0 }), jours.get(jour)!);

  const idsRacines = new Set(racines.map((r) => r.id));
  for (const l of insights) {
    if (!idsRacines.has(l.campaign_id)) continue;
    pose(l.day).spendMad += Number(l.spend_mad ?? 0);
  }
  for (const l of delivered) {
    // Faute de date de livraison, la commande est rangee au jour de sa
    // creation : mieux vaut un jour approchant qu'une ligne perdue.
    const jour = (l.delivery_date ?? l.created_at).slice(0, 10);
    pose(jour).delivered += 1;
  }

  const daily = [...jours.entries()]
    .map(([day, v]) => ({ day, spendMad: round2(v.spendMad), delivered: v.delivered }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const lastSyncAt = insights
    .map((i) => i.synced_at)
    .sort()
    .at(-1);

  return {
    spendMad,
    impressions,
    clicks,
    conversions,
    ctr: round2(ratio(clicks, impressions) * 100),
    cpc: round2(ratio(spendMad, clicks)),
    cpm: round2(ratio(spendMad, impressions) * 1000),

    leads: leads.length,
    confirmed: confirmed.length,
    delivered: delivered.length,
    revenueDelivered: round2(revenueDelivered),
    confirmRate: Math.round(ratio(confirmed.length, leads.length) * 100),
    deliveryRate: Math.round(ratio(delivered.length, confirmed.length) * 100),

    costPerLead: round2(ratio(spendMad, leads.length)),
    costPerConfirmed: round2(ratio(spendMad, confirmed.length)),
    // Le chiffre qui decide : ce que coute une vente reellement encaissee.
    costPerDelivered: round2(ratio(spendMad, delivered.length)),
    // Retour sur depense publicitaire, sur le seul argent vraiment rentre.
    roas: round2(ratio(revenueDelivered, spendMad)),

    campaigns: rows,
    currency: insights.find((i) => i.currency)?.currency ?? undefined,
    daily,
    lastSyncAt,
  };
}
