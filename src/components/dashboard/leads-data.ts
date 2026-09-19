/**
 * Statuts de confirmation, dans l'ordre ou l'equipe les parcourt.
 *
 * La liste vient du service de confirmation : les paliers numerotes
 * comptent les tentatives, ce que "Pas de reponse" seul ne disait pas.
 *
 * "Confirme" garde son orthographe existante plutot que "Confirmer" du
 * tableau d'origine : c'est ce statut qui declenche l'expedition chez
 * ForceLog, et 18 commandes le portent deja. Le renommer demanderait de
 * migrer ces lignes pour un synonyme.
 */
export const LEAD_STATUSES = [
  { label: "Nouveau", badge: "bg-sky-500 text-white" },
  { label: "Confirme", badge: "bg-emerald-700 text-white" },
  { label: "Pas de rep 1", badge: "bg-rose-100 text-rose-700" },
  { label: "Pas de rep 2", badge: "bg-rose-100 text-rose-700" },
  { label: "Pas de rep 3", badge: "bg-rose-100 text-rose-700" },
  { label: "Pas de rep 4", badge: "bg-rose-100 text-rose-700" },
  { label: "Pas de rep 5", badge: "bg-rose-100 text-rose-700" },
  { label: "Injoignable 1", badge: "bg-orange-200 text-orange-800" },
  { label: "Injoignable 2", badge: "bg-orange-200 text-orange-800" },
  { label: "Injoignable 3", badge: "bg-orange-200 text-orange-800" },
  { label: "Injoignable 4", badge: "bg-orange-200 text-orange-800" },
  { label: "Injoignable 5", badge: "bg-orange-200 text-orange-800" },
  { label: "En attente", badge: "bg-purple-200 text-purple-800" },
  { label: "Reportee", badge: "bg-blue-700 text-white" },
  { label: "Whatsapp", badge: "bg-yellow-200 text-yellow-800" },
  { label: "Annulee", badge: "bg-red-700 text-white" },
  { label: "Faux numero", badge: "bg-red-700 text-white" },
  { label: "Non commandee", badge: "bg-red-700 text-white" },
  { label: "Expiree", badge: "bg-amber-800 text-white" },
  { label: "En double", badge: "bg-gray-700 text-white" },
  { label: "Rappel", badge: "bg-slate-300 text-slate-800" },
  { label: "+3 jours", badge: "bg-amber-500 text-white" },
  { label: "EXPIDER", badge: "bg-blue-600 text-white" },
  { label: "TESTE", badge: "bg-violet-700 text-white" },
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number]["label"];

export type LeadSource =
  | "Excel import"
  | "whatsapp"
  | "Agent Manual"
  | "nouveau"
  | "Direct"
  | "Landing page"
  | "Lightfunnels"
  | "WooCommerce"
  | "ForceLog";

export type Lead = {
  id: string;
  reference: string;
  productLabel: string;
  productName: string;
  itemCount?: number;
  client: string;
  phone: string;
  source: LeadSource;
  assignedTo: string;
  amount: string;
  status: LeadStatus;
  shipping: string;
  date: string;
  ville?: string;
  tarif?: string;
  quartier?: string;
  adresse?: string;
  trackingNumber?: string;
  /**
   * Dernier refus du transporteur. `null` efface une erreur precedente :
   * `undefined` signifie "ne touche pas a ce champ", et laissait donc
   * une erreur resolue affichee a cote d'un colis bien cree.
   */
  trackingError?: string | null;
  /** Libelle du statut de livraison remonte par ForceLog. */
  deliveryStatus?: string;
  /** Code machine du statut de livraison ForceLog (sert au style du badge). */
  deliveryStatusCode?: string;
  /** Statut de paiement remonte par ForceLog (champ SITUATION). */
  paymentStatus?: string;
  /**
   * Date a laquelle le colis a ete vu livre, format "AAAA-MM-JJ HH:MM".
   * Horodatee par la synchronisation ForceLog au passage en DELIVERED.
   */
  deliveryDate?: string;
  /**
   * Type d'expedition ForceLog :
   * - "simple" : marchandise expediee depuis notre depot
   * - "stock"  : marchandise prelevee dans le depot ForceLog
   */
  parcelType?: "simple" | "stock";
  /** References prelevees pour un colis de stock, format "ref:qte,ref:qte". */
  stockItems?: string;
  /**
   * Consigne du client sur la livraison, ex. "livrer apres 19H".
   * Transmise au transporteur dans le champ COMMENT du colis, a sa
   * creation : ForceLog ne sait pas modifier un colis deja parti.
   */
  customerNote?: string;
  /** Identifiant de la commande dans la boutique WooCommerce. */
  wooOrderId?: number;
  /** Auteur de la derniere modification : une personne ou un automate. */
  lastModifiedBy?: string;
  lastModifiedAt?: string;
  /**
   * Photo du produit, retrouvee dans le catalogue a la lecture. Elle
   * n'est pas enregistree sur la commande : changer la photo d'un
   * produit doit se voir sur toutes ses commandes, pas seulement les
   * suivantes.
   */
  productImage?: string;
};

export const leads: Lead[] = [
  {
    id: "1",
    reference: "spc-1003",
    productLabel: "SAC",
    productName: "SAC LO",
    itemCount: 2,
    client: "soufiane imil",
    phone: "0660164362",
    source: "Agent Manual",
    assignedTo: "Imane Lahlou",
    amount: "500 MAD",
    status: "Nouveau",
    shipping: "En attente",
    date: "19 aout 2026, 21:59",
    ville: "Oujda",
    tarif: "48 MAD",
    quartier: "Maarif",
    adresse: "11 Rue Example",
  },
  {
    id: "2",
    reference: "spc-1002",
    productLabel: "DIF",
    productName: "Diffuseur Atlas Zen",
    client: "soufiane imil",
    phone: "0660164361",
    source: "Direct",
    assignedTo: "soufiane imil",
    amount: "200 MAD",
    status: "Nouveau",
    shipping: "En attente",
    date: "19 aout 2026, 21:59",
  },
  {
    id: "3",
    reference: "spc-1001",
    productLabel: "DIF",
    productName: "Diffuseur Atlas Zen",
    client: "soufiane imil",
    phone: "0660164360",
    source: "Landing page",
    assignedTo: "soufiane imil",
    amount: "200 MAD",
    status: "Nouveau",
    shipping: "En attente",
    date: "19 aout 2026, 21:59",
    ville: "Sale",
    tarif: "38 MAD",
  },
  {
    id: "4",
    reference: "MO-E8HQ7-0811",
    productLabel: "BOIS",
    productName: "Sac Cuir Marrakech",
    client: "ayoub",
    phone: "0622161711",
    source: "Lightfunnels",
    assignedTo: "Youssef Idrissi",
    amount: "249 MAD",
    status: "Confirme",
    shipping: "En attente",
    date: "21 aout 2026, 22:39",
    ville: "Meknes",
    tarif: "42 MAD",
  },
  {
    id: "5",
    reference: "MO-MX7NC-0802",
    productLabel: "BOIS",
    productName: "Bracelet Atlas Silver",
    itemCount: 2,
    client: "Yassin",
    phone: "0630053131",
    source: "Landing page",
    assignedTo: "Fatima Zahra",
    amount: "279 MAD",
    status: "Rappel",
    shipping: "En attente",
    date: "20 aout 2026, 19:14",
    ville: "Tanger",
  },
  {
    id: "6",
    reference: "MO-DWZW8-0728",
    productLabel: "SAC",
    productName: "SAC LO",
    client: "achraf",
    phone: "0666686869",
    source: "Agent Manual",
    assignedTo: "Fatima Zahra",
    amount: "837 MAD",
    status: "Annulee",
    shipping: "En attente",
    date: "23 juil. 2026, 22:39",
  },
  {
    id: "7",
    reference: "MO-EES7K-0728",
    productLabel: "SAC",
    productName: "Serum Derma Glow",
    client: "samba",
    phone: "0623145234",
    source: "nouveau",
    assignedTo: "Fatima Zahra",
    amount: "558 MAD",
    status: "En attente",
    shipping: "En attente",
    date: "28 juil. 2026, 08:40",
  },
  {
    id: "8",
    reference: "MO-QX21S-0705",
    productLabel: "WATCH",
    productName: "Montre Pro X V2",
    client: "hicham inconnu",
    phone: "0611223344",
    source: "Direct",
    assignedTo: "Karim El Mansouri",
    amount: "799 MAD",
    status: "Faux numero",
    shipping: "En attente",
    date: "5 juil. 2026, 10:12",
  },
];

/**
 * Onglets de la liste. Un onglet regroupe parfois plusieurs statuts :
 * les cinq paliers de "Pas de rep" sont des tentatives d'un meme etat,
 * cinq onglets pour eux noieraient les autres.
 */
const tabDefinitions: {
  label: string;
  statuses: LeadStatus[] | null;
  /** Onglet signale en ambre : un dossier qui attend depuis trop longtemps. */
  warn?: boolean;
  flagged?: boolean;
}[] = [
  { label: "Tous", statuses: null },
  { label: "Nouveaux", statuses: ["Nouveau"] },
  { label: "Confirmes", statuses: ["Confirme", "EXPIDER"] },
  { label: "Rappels", statuses: ["Rappel", "Reportee"] },
  {
    label: "Pas de rep.",
    statuses: [
      "Pas de rep 1",
      "Pas de rep 2",
      "Pas de rep 3",
      "Pas de rep 4",
      "Pas de rep 5",
    ],
  },
  {
    label: "Injoignables",
    statuses: [
      "Injoignable 1",
      "Injoignable 2",
      "Injoignable 3",
      "Injoignable 4",
      "Injoignable 5",
    ],
  },
  { label: "En attente", statuses: ["En attente", "Whatsapp"] },
  { label: "Annules", statuses: ["Annulee", "Non commandee", "Expiree"] },
  {
    label: "Faux / spam",
    statuses: ["Faux numero", "En double", "TESTE"],
    flagged: true,
  },
  { label: "+3 jours", statuses: ["+3 jours"], warn: true },
];

export const tabs = tabDefinitions.map((tab) => ({
  ...tab,
  count: 0,
}));

/** La commande appartient-elle a cet onglet ? */
/**
 * Les automates qui touchent une commande sans etre quelqu'un.
 *
 * Ils creent et mettent a jour des commandes, mais on ne leur en assigne
 * pas : une commande qu'aucune personne n'a encore prise n'est assignee
 * a personne, et la colonne reste vide plutot que d'annoncer un robot.
 */
const AUTOMATIONS = new Set(["WooCommerce", "ForceLog", "Google Sheets"]);

/** La personne qui s'occupe de la commande, si c'en est une. */
export function assigneeName(name: string | undefined): string | undefined {
  if (!name || AUTOMATIONS.has(name)) return undefined;
  return name;
}

export function matchesTab(
  tab: { statuses: LeadStatus[] | null },
  status: LeadStatus
): boolean {
  return tab.statuses === null || tab.statuses.includes(status);
}

/**
 * Mois francais tels qu'ils apparaissent dans les dates affichees,
 * abreges ou non, avec et sans accent.
 */
const FRENCH_MONTHS: Record<string, number> = {
  janv: 0, janvier: 0,
  fevr: 1, fevrier: 1, "fév": 1, "févr": 1, "février": 1,
  mars: 2,
  avr: 3, avril: 3,
  mai: 4,
  juin: 5,
  juil: 6, juillet: 6,
  aout: 7, "août": 7,
  sept: 8, septembre: 8,
  oct: 9, octobre: 9,
  nov: 10, novembre: 10,
  dec: 11, "déc": 11, decembre: 11, "décembre": 11,
};

/**
 * Date reelle d'une commande, lue depuis le texte affiche.
 *
 * Deux formats coexistent selon l'origine : "2026-09-11 16:12" pour les
 * colis importes de ForceLog, "13 sept. 2026, 14:40" pour une saisie
 * dans l'application. Renvoie `null` si rien n'est exploitable, auquel
 * cas la commande echappe aux filtres de periode plutot que d'etre
 * rangee a une date inventee.
 */
export function parseLeadDate(value: string | undefined): Date | null {
  if (!value) return null;

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (iso) {
    const [, y, m, d, hh = "0", mm = "0"] = iso;
    return new Date(+y, +m - 1, +d, +hh, +mm);
  }

  const fr = value.match(
    /^(\d{1,2})\s+([^\s.]+)\.?\s+(\d{4})(?:,\s*(\d{1,2}):(\d{2}))?/
  );
  if (fr) {
    const [, d, monthName, y, hh = "0", mm = "0"] = fr;
    const month = FRENCH_MONTHS[monthName.toLowerCase()];
    if (month !== undefined) return new Date(+y, month, +d, +hh, +mm);
  }

  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export const dateRanges = [
  "Aujourd'hui",
  "Hier",
  "7 derniers jours",
  "Ce mois-ci",
  "Maximum",
  "Personnalisee",
];

export const sourceBadgeStyles: Record<LeadSource, string> = {
  "Excel import": "bg-blue-50 text-blue-600",
  whatsapp: "bg-pink-50 text-pink-600",
  "Agent Manual": "bg-gray-100 text-gray-600",
  nouveau: "bg-emerald-50 text-emerald-600",
  Direct: "bg-gray-100 text-gray-600",
  "Landing page": "bg-blue-50 text-blue-600",
  Lightfunnels: "bg-blue-50 text-blue-600",
  WooCommerce: "bg-violet-50 text-violet-600",
  ForceLog: "bg-orange-50 text-orange-600",
};

/**
 * Style des badges de statut de livraison, par code ForceLog.
 *
 * Releves sur leur API en service. Un code inconnu retombe sur un gris
 * neutre plutot que de disparaitre : mieux vaut un badge terne qu'un
 * statut invisible.
 *
 * Les couleurs disent l'issue d'un coup d'oeil : vert remis, rouge
 * perdu, orange revenu, ambre en attente d'action, bleu en route.
 */
export const deliveryStatusStyles: Record<string, string> = {
  NEW_PARCEL: "bg-sky-500 text-white",
  WAITING_PICKUP: "bg-amber-500 text-white",
  SENT: "bg-blue-600 text-white",
  DISTRIBUTION: "bg-indigo-500 text-white",
  DELIVERED: "bg-emerald-600 text-white",
  RETURNED: "bg-orange-500 text-white",
  REFUSE: "bg-red-600 text-white",
  CANCELED: "bg-red-600 text-white",
  RELAUNCH: "bg-violet-500 text-white",
  OUT_OF_AREA: "bg-gray-500 text-white",
  NO_ANSWER: "bg-gray-500 text-white",
  // Ajoutes apres la mise a jour de leur API, le 18 septembre 2026.
  POSTPONED: "bg-amber-500 text-white",
  PROGRAMMED: "bg-violet-500 text-white",
  TSUIVI: "bg-slate-500 text-white",
  UNREACHABLE: "bg-gray-500 text-white",
  UNREACHABLE_TEAM: "bg-gray-600 text-white",
};

/** Style des badges de statut de paiement (champ SITUATION de ForceLog). */
export function paymentStatusStyle(situation: string): string {
  const value = situation.toLowerCase();
  if (value.includes("non pay")) return "bg-red-50 text-red-600";
  if (value.includes("factur")) return "bg-emerald-50 text-emerald-600";
  if (value.includes("pay")) return "bg-emerald-600 text-white";
  return "bg-gray-100 text-gray-600";
}

export const statusBadgeStyles: Record<string, string> = Object.fromEntries(
  LEAD_STATUSES.map((s) => [s.label, s.badge])
);

export const agents = [
  "Fatima Zahra",
  "Hamza Berrada",
  "Imane Lahlou",
  "Karim El Mansouri",
  "Nadia El Fassi",
  "Omar Tazi",
  "Salma Bennani",
  "soufiane imil",
  "Youssef Idrissi",
];

export const moroccanCities = [
  "Casablanca",
  "Rabat",
  "Marrakech",
  "Tanger",
  "Fes",
  "Agadir",
  "Meknes",
  "Oujda",
];

export const expeditionStatuses = [
  "En attente",
  "Expedie",
  "En transit",
  "Livre",
  "Retourne",
  "Refuse",
];

export const sourceOptions = [
  "agent_manual",
  "Excel import",
  "Google Sheets",
  "Landing page",
  "Mobile app",
  "nouveau",
  "Shopify",
  "whatsapp",
  "WooCommerce",
];

export const leadStatusOptions = [
  "Aucun changement",
  ...LEAD_STATUSES.map((s) => s.label),
];

export const productNames = [
  "SAC LO",
  "Diffuseur Atlas Zen",
  "Serum Derma Glow",
  "Powerbank MagSafe Atlas",
];

export const attentionLevels = ["Urgent", "Normal", "Faible"];

export const reminderDueOptions = [
  "En retard",
  "Aujourd'hui",
  "Demain",
  "Cette semaine",
];

export const amountRanges = [
  "0 - 200 MAD",
  "200 - 500 MAD",
  "500 - 1000 MAD",
  "1000 MAD et plus",
];

export const notesOptions = ["Avec notes", "Sans notes"];
