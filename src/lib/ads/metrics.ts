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
  /** Mise en garde affichee en infobulle. */
  hint?: string;
};

/** La depense, toujours disponible, lue sur sa propre colonne. */
export const SPEND_KEY = "spend_mad";

export const METRICS: Metric[] = [
  { key: SPEND_KEY, label: "Montant depense", kind: "sum", format: "money" },
  {
    key: "reach",
    label: "Couverture",
    kind: "sum",
    format: "entier",
    hint:
      "Somme des couvertures quotidiennes. Une personne touchee deux jours " +
      "compte deux fois : seule la plateforme sait dedoublonner sur une periode.",
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

/** Prefixe des resultats par type d'action, decouverts a la relevee. */
export const ACTION_PREFIX = "action:";

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
      return `${nf2.format(value)} DH`;
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
export function availableMetrics(bags: (MetricBag | null | undefined)[]): Metric[] {
  const vues = new Set<string>();
  for (const bag of bags) {
    for (const k of Object.keys(bag ?? {})) {
      if (k.startsWith(ACTION_PREFIX)) vues.add(k);
    }
  }
  const actions = [...vues].sort();
  return [
    ...METRICS,
    ...actions.map(actionMetric),
    ...actions.map(actionCostMetric),
  ];
}

/** Ce qu'on affiche tant que personne n'a choisi ses colonnes. */
export const DEFAULT_COLUMNS = [
  SPEND_KEY,
  "reach",
  "impressions",
  "frequency",
  "clicks",
  "cpc",
  "ctr",
  "cpm",
];

/** Les groupes de colonnes de Meta, repris tels quels. */
export const PRESETS: { label: string; columns: string[] }[] = [
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
