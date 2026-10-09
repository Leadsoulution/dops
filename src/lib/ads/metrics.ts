/**
 * Les colonnes du gestionnaire de publicites, et comment les additionner.
 *
 * C'est la seule question difficile de ce fichier. Des impressions
 * s'additionnent ; un CTR, non. Additionner les CTR de sept journees
 * donnerait sept fois trop, et faire leur moyenne donnerait un chiffre
 * ou la journee a trois impressions pese autant que celle a trente
 * mille. Un taux se recalcule a partir de ses deux termes, toujours.
 *
 * Chaque colonne declare donc comment elle se construit : une somme,
 * ou un rapport entre deux sommes.
 */

export type MetricKind =
  /** S'additionne d'une journee et d'un etage a l'autre. */
  | "sum"
  /** Se recalcule a partir de deux sommes. Jamais additionne. */
  | "ratio";

export type MetricFormat = "entier" | "money" | "percent" | "decimal";

export type Metric = {
  key: string;
  label: string;
  kind: MetricKind;
  format: MetricFormat;
  /** Pour un rapport : numerateur, denominateur, et facteur d'echelle. */
  of?: { num: string; den: string; scale?: number };
  /**
   * Unite affichee apres un montant. "DH" par defaut.
   *
   * Un cout exprime dans la devise du compte doit porter cette
   * devise : lire "0,30 DH" sous une depense de 11,43 CAD invite a
   * comparer deux nombres qui ne sont pas dans la meme monnaie.
   */
  unit?: string;
  /** Mise en garde affichee en infobulle. */
  hint?: string;
};

/** La depense convertie en dirhams, lue sur sa propre colonne. */
export const SPEND_KEY = "spend_mad";

/**
 * La depense dans la devise du compte, telle que la plateforme
 * l'affiche.
 *
 * Elle existe pour une raison simple : on compare l'application au
 * gestionnaire de publicites, cote a cote, et deux nombres convertis
 * ne se comparent pas. 374,21 CAD et 2 619,47 DH sont le meme montant,
 * mais rien ne le dit a qui les regarde.
 */
export const SPEND_SOURCE_KEY = "spend_src";

export const METRICS: Metric[] = [
  { key: SPEND_KEY, label: "Montant depense (DH)", kind: "sum", format: "money" },
  {
    key: SPEND_SOURCE_KEY,
    label: "Montant depense",
    kind: "sum",
    format: "decimal",
    hint: "Dans la devise du compte, comme le gestionnaire de publicites.",
  },
  {
    key: "reach",
    label: "Couverture",
    kind: "sum",
    format: "entier",
    hint:
      "Somme des couvertures quotidiennes, donc surevaluee : une personne " +
      "touchee deux jours y compte deux fois. Mesure faite sur ce compte : " +
      "173 181 contre 160 002 annonces par la plateforme, soit 8 % de trop. " +
      "Seule la plateforme sait dedoublonner sur une periode.",
  },
  { key: "impressions", label: "Impressions", kind: "sum", format: "entier" },
  {
    key: "frequency",
    label: "Frequence",
    kind: "ratio",
    format: "decimal",
    of: { num: "impressions", den: "reach" },
  },
  { key: "clicks", label: "Clics (tous)", kind: "sum", format: "entier" },
  { key: "unique_clicks", label: "Clics uniques", kind: "sum", format: "entier" },
  {
    key: "inline_link_clicks",
    label: "Clics sur lien",
    kind: "sum",
    format: "entier",
  },
  {
    key: "outbound_clicks",
    label: "Clics sortants",
    kind: "sum",
    format: "entier",
  },
  {
    key: "cpc",
    label: "CPC (tous)",
    kind: "ratio",
    format: "money",
    of: { num: SPEND_KEY, den: "clicks" },
  },
  {
    key: "cost_per_unique_click",
    label: "Cout par clic unique",
    kind: "ratio",
    format: "money",
    of: { num: SPEND_KEY, den: "unique_clicks" },
  },
  {
    key: "cost_per_inline_link_click",
    label: "Cout par clic sur lien",
    kind: "ratio",
    format: "money",
    of: { num: SPEND_KEY, den: "inline_link_clicks" },
  },
  {
    key: "cpm",
    label: "CPM",
    kind: "ratio",
    format: "money",
    of: { num: SPEND_KEY, den: "impressions", scale: 1000 },
  },
  {
    key: "cpp",
    label: "CPP",
    kind: "ratio",
    format: "money",
    of: { num: SPEND_KEY, den: "reach", scale: 1000 },
  },
  {
    key: "ctr",
    label: "CTR (tous)",
    kind: "ratio",
    format: "percent",
    of: { num: "clicks", den: "impressions", scale: 100 },
  },
  {
    key: "unique_ctr",
    label: "CTR unique",
    kind: "ratio",
    format: "percent",
    of: { num: "unique_clicks", den: "reach", scale: 100 },
  },
  {
    key: "inline_link_click_ctr",
    label: "CTR lien",
    kind: "ratio",
    format: "percent",
    of: { num: "inline_link_clicks", den: "impressions", scale: 100 },
  },
  {
    key: "outbound_clicks_ctr",
    label: "CTR sortant",
    kind: "ratio",
    format: "percent",
    of: { num: "outbound_clicks", den: "impressions", scale: 100 },
  },
  { key: "video_p25", label: "Video 25 %", kind: "sum", format: "entier" },
  { key: "video_p100", label: "Video 100 %", kind: "sum", format: "entier" },
];

/**
 * Les commandes de la boutique, rattachees a ce qui les a amenees.
 *
 * Meta compte ce que son pixel a vu ; nous comptons ce que le livreur
 * a remis. Entre les deux il y a le telephone qui ne repond pas et le
 * colis qui revient — et c'est tout l'ecart entre une campagne qui
 * parait bonne et une campagne qui paie.
 */
export const ORDER_METRICS: Metric[] = [
  { key: "orders", label: "Commandes", kind: "sum", format: "entier" },
  {
    key: "orders_confirmed",
    label: "Confirmees",
    kind: "sum",
    format: "entier",
  },
  {
    key: "confirm_rate",
    label: "Taux de confirmation",
    kind: "ratio",
    format: "percent",
    of: { num: "orders_confirmed", den: "orders", scale: 100 },
  },
  { key: "orders_delivered", label: "Livrees", kind: "sum", format: "entier" },
  {
    key: "delivery_rate",
    label: "Taux de livraison",
    kind: "ratio",
    format: "percent",
    of: { num: "orders_delivered", den: "orders_confirmed", scale: 100 },
  },
  {
    key: "cost_per_delivered",
    label: "Cout par livree",
    kind: "ratio",
    format: "money",
    of: { num: SPEND_KEY, den: "orders_delivered" },
    hint:
      "La depense divisee par les commandes reellement remises. C'est le " +
      "seul cout qui compte en paiement a la livraison.",
  },
  {
    key: "revenue_delivered",
    label: "CA livre",
    kind: "sum",
    format: "money",
  },
  {
    key: "roas_delivered",
    label: "ROAS livre",
    kind: "ratio",
    format: "decimal",
    of: { num: "revenue_delivered", den: SPEND_KEY },
    hint: "Chiffre d'affaires encaisse pour un dirham depense.",
  },
];

/**
 * Les deux colonnes de resultat.
 *
 * Elles ne se calculent pas depuis une cle fixe : leur valeur est la
 * somme de toutes les cles `result:`, qui varient d'une campagne a
 * l'autre. L'ecran les traite donc a part.
 */
export const RESULTS_KEY = "__results__";
export const COST_PER_RESULT_KEY = "__cost_per_result__";

export const RESULT_METRICS: Metric[] = [
  {
    key: RESULTS_KEY,
    label: "Resultats",
    kind: "sum",
    format: "entier",
    hint:
      "Ce que la campagne optimise : achat, interaction, visite de profil. " +
      "L'indicateur est rappele sous le chiffre.",
  },
  {
    key: COST_PER_RESULT_KEY,
    label: "Cout par resultat",
    kind: "ratio",
    format: "money",
    /*
     * Dans la devise du compte, comme la depense a cote.
     * C'est ce chiffre qu'on compare a celui du gestionnaire de
     * publicites, et le convertir en dirhams le rendait incomparable.
     */
    of: { num: SPEND_SOURCE_KEY, den: RESULTS_KEY },
  },
];

/** Prefixe des resultats par type d'action, decouverts a la relevee. */
export const ACTION_PREFIX = "action:";

/**
 * Prefixe du resultat tel que la plateforme le compte, suivi de son
 * indicateur : achat pixel, interaction, visite de profil.
 */
export const RESULT_PREFIX = "result:";

/** Les cles de resultat presentes dans un sac de mesures. */
export function resultKeys(bag: MetricBag): string[] {
  return Object.keys(bag).filter((k) => k.startsWith(RESULT_PREFIX));
}

/**
 * Le total des resultats, quel que soit l'indicateur.
 *
 * Deux campagnes qui n'optimisent pas la meme chose ont des resultats
 * de nature differente. Les additionner est ce que fait Meta lui-meme
 * dans sa ligne de total, en la nommant "plusieurs conversions" —
 * c'est un compte d'evenements, pas une grandeur homogene.
 */
export function resultTotal(bag: MetricBag): number {
  return resultKeys(bag).reduce((t, k) => t + (bag[k] ?? 0), 0);
}

/**
 * Le detail des resultats, indicateur par indicateur.
 *
 * Un achat et une interaction avec une publication ne sont pas la
 * meme grandeur. Leur somme est celle que Meta affiche lui-meme, mais
 * elle ne veut rien dire tant qu'on ne sait pas de quoi elle est
 * faite : 237 "resultats" dont 146 achats et 91 interactions ne se
 * compare a aucun chiffre du gestionnaire de publicites, qui n'y
 * montre que les campagnes non archivees.
 */
export function resultBreakdown(
  bag: MetricBag
): { label: string; value: number }[] {
  return resultKeys(bag)
    .map((k) => ({
      label: actionLabel(k.slice(RESULT_PREFIX.length)),
      value: bag[k] ?? 0,
    }))
    .sort((a, b) => b.value - a.value);
}

/** De quoi sont faits ces resultats, pour le dire sous le chiffre. */
export function resultLabel(bag: MetricBag): string {
  const cles = resultKeys(bag);
  if (cles.length === 0) return "";
  if (cles.length > 1) return "Plusieurs conversions";
  return actionLabel(cles[0].slice(RESULT_PREFIX.length));
}

/**
 * Les actions n'ont pas de liste figee : chaque objectif publicitaire
 * produit les siennes, et Meta en ajoute. On fabrique donc leur
 * colonne a la volee, a partir de ce que les releves contiennent.
 */
export function actionMetric(key: string): Metric {
  const type = key.slice(ACTION_PREFIX.length);
  return { key, label: actionLabel(type), kind: "sum", format: "entier" };
}

/** Le cout d'une action : la depense divisee par son nombre. */
export function actionCostMetric(key: string): Metric {
  const type = key.slice(ACTION_PREFIX.length);
  return {
    key: `cost:${type}`,
    label: `Cout par ${actionLabel(type).toLowerCase()}`,
    kind: "ratio",
    format: "money",
    of: { num: SPEND_KEY, den: key },
  };
}

/** Les noms que Meta donne a ses actions, en francais quand on les connait. */
const ACTION_LABELS: Record<string, string> = {
  link_click: "Clics sur le lien",
  landing_page_view: "Vues de page de destination",
  post_engagement: "Interactions avec la publication",
  page_engagement: "Interactions avec la Page",
  video_view: "Vues de video",
  post_reaction: "Reactions",
  comment: "Commentaires",
  post: "Partages",
  lead: "Prospects",
  purchase: "Achats",
  view_content: "Contenus vus",
  omni_view_content: "Contenus vus (tous)",
  initiate_checkout: "Paiements inities",
  add_to_cart: "Ajouts au panier",
  "onsite_conversion.messaging_conversation_started_7d":
    "Conversations lancees",
  "onsite_conversion.total_messaging_connection": "Connexions par message",
  "offsite_conversion.fb_pixel_view_content": "Contenus vus (pixel)",
  "offsite_conversion.fb_pixel_purchase": "Achats (pixel)",
  outbound_click: "Clics sortants",
};

export function actionLabel(type: string): string {
  return ACTION_LABELS[type] ?? type.replace(/_/g, " ");
}

export type MetricBag = Record<string, number>;

/**
 * Additionne plusieurs releves en un seul.
 *
 * Les sommes s'ajoutent, les rapports sont ignores a ce stade : ils
 * seront recalcules par `metricValue` a partir des sommes obtenues.
 * Garder les rapports additionnes ici donnerait des CTR de 400 %.
 */
export function sumMetrics(bags: (MetricBag | null | undefined)[]): MetricBag {
  const ratios = new Set(
    METRICS.filter((m) => m.kind === "ratio").map((m) => m.key)
  );
  const total: MetricBag = {};
  for (const bag of bags) {
    if (!bag) continue;
    for (const [k, v] of Object.entries(bag)) {
      if (ratios.has(k) || k.startsWith("cost:")) continue;
      const n = Number(v);
      if (Number.isFinite(n)) total[k] = (total[k] ?? 0) + n;
    }
  }
  return total;
}

/**
 * La valeur d'une colonne pour un ensemble de releves deja sommes.
 *
 * Un denominateur nul rend 0 plutot que l'infini : une campagne sans
 * clic n'a pas un cout par clic infini, elle n'en a pas.
 */
export function metricValue(metric: Metric, bag: MetricBag): number {
  if (metric.kind === "sum") return bag[metric.key] ?? 0;
  const { num, den, scale = 1 } = metric.of!;
  const d = bag[den] ?? 0;
  if (d <= 0) return 0;
  return ((bag[num] ?? 0) / d) * scale;
}

const nf = new Intl.NumberFormat("fr-FR");
const nf2 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMetric(metric: Metric, value: number): string {
  switch (metric.format) {
    case "money":
      return `${nf2.format(value)} ${metric.unit ?? "DH"}`;
    case "percent":
      return `${nf2.format(value)} %`;
    case "decimal":
      return nf2.format(value);
    default:
      return nf.format(Math.round(value));
  }
}

/**
 * Les colonnes proposees : celles qu'on connait, plus celles que les
 * releves ont fait apparaitre. Une action jamais produite par le
 * compte n'encombre pas la liste.
 */
export function availableMetrics(
  bags: (MetricBag | null | undefined)[],
  /** Devise du compte, pour nommer la colonne de depense d'origine. */
  currency?: string
): Metric[] {
  const vues = new Set<string>();
  for (const bag of bags) {
    for (const k of Object.keys(bag ?? {})) {
      if (k.startsWith(ACTION_PREFIX)) vues.add(k);
    }
  }
  const actions = [...vues].sort();
  const aDesResultats = bags.some((b) => b && resultKeys(b).length > 0);
  const base = currency
    ? METRICS.map((m) =>
        m.key === SPEND_SOURCE_KEY
          ? { ...m, label: `Montant depense (${currency})` }
          : m
      )
    : METRICS;
  const resultats = currency
    ? RESULT_METRICS.map((m) =>
        m.key === COST_PER_RESULT_KEY ? { ...m, unit: currency } : m
      )
    : RESULT_METRICS;
  const aDesCommandes = bags.some((b) => (b?.orders ?? 0) > 0);
  return [
    ...(aDesResultats ? resultats : []),
    ...(aDesCommandes ? ORDER_METRICS : []),
    ...base,
    ...actions.map(actionMetric),
    ...actions.map(actionCostMetric),
  ];
}

/**
 * Pose le total des resultats dans le sac, sous une cle fixe.
 *
 * Le cout par resultat est un rapport comme les autres : il lui faut
 * un denominateur nomme. Sans cette etape il diviserait par une cle
 * qui n'existe dans aucun releve.
 */
export function withResultTotal(bag: MetricBag): MetricBag {
  const total = resultTotal(bag);
  return total > 0 ? { ...bag, [RESULTS_KEY]: total } : bag;
}

/** Ce qu'on affiche tant que personne n'a choisi ses colonnes. */
export const DEFAULT_COLUMNS = [
  SPEND_SOURCE_KEY,
  SPEND_KEY,
  "impressions",
  "frequency",
  "clicks",
  "cpc",
  "ctr",
  "cpm",
];

/** Les groupes de colonnes de Meta, repris tels quels. */
export const PRESETS: { label: string; columns: string[] }[] = [
  /*
   * Les colonnes du preReglage "NASSIM" du compte, relevees sur son
   * ecran. "Budget" en est absent : c'est un reglage de la campagne,
   * pas une mesure, et il ne vient pas du meme appel. "Hold Rate" et
   * "CREAT RAT" aussi : Meta n'expose aucune metrique personnalisee.
   */
  {
    label: "NASSIM",
    columns: [
      RESULTS_KEY,
      COST_PER_RESULT_KEY,
      SPEND_SOURCE_KEY,
      "reach",
      "impressions",
      "frequency",
      "cpm",
      "clicks",
      "cpc",
      "ctr",
      "inline_link_click_ctr",
      "action:landing_page_view",
      "cost:landing_page_view",
    ],
  },
  {
    label: "Rentabilite",
    columns: [
      SPEND_SOURCE_KEY,
      SPEND_KEY,
      "orders",
      "orders_confirmed",
      "confirm_rate",
      "orders_delivered",
      "delivery_rate",
      "cost_per_delivered",
      "revenue_delivered",
      "roas_delivered",
    ],
  },
  { label: "Performance", columns: DEFAULT_COLUMNS },
  {
    label: "Engagement",
    columns: [
      SPEND_KEY,
      "impressions",
      "action:post_engagement",
      "action:page_engagement",
      "action:post_reaction",
      "action:video_view",
    ],
  },
  {
    label: "Diffusion",
    columns: [SPEND_KEY, "reach", "impressions", "frequency", "cpm", "cpp"],
  },
  {
    label: "Clics",
    columns: [
      SPEND_KEY,
      "clicks",
      "unique_clicks",
      "inline_link_clicks",
      "outbound_clicks",
      "ctr",
      "inline_link_click_ctr",
      "cost_per_inline_link_click",
    ],
  },
  {
    label: "Video",
    columns: [SPEND_KEY, "action:video_view", "video_p25", "video_p100", "cpm"],
  },
];
