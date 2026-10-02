/**
 * Les charges de l'exploitation, et ce qui les distingue.
 *
 * Quatre natures de depense, parce qu'elles ne se repartissent pas de
 * la meme facon sur les commandes. Un emballage se compte par colis,
 * un loyer par mois, une campagne par periode. Les melanger dans une
 * seule liste de montants rendrait tout profit par commande impossible
 * a etablir.
 */

export type ExpenseType =
  /** Un cout unitaire declenche par un statut de commande. */
  | "par_commande"
  /** Montant identique a chaque periode : loyer, salaires, abonnements. */
  | "fixe"
  /** Meme nature, montant different a chaque periode : electricite, carburant. */
  | "variable"
  /** Campagne publicitaire, eventuellement en devise etrangere. */
  | "publicite"
  /** Depense unique, a une date. */
  | "ponctuelle";

export const EXPENSE_TYPES: { value: ExpenseType; label: string; hint: string }[] =
  [
    {
      value: "par_commande",
      label: "Par commande",
      hint: "Emballage, commission agent, frais COD",
    },
    {
      value: "fixe",
      label: "Fixe recurrente",
      hint: "Loyer, salaires, abonnements",
    },
    {
      value: "variable",
      label: "Variable recurrente",
      hint: "Electricite, carburant, internet",
    },
    { value: "publicite", label: "Publicite", hint: "Facebook, TikTok, Google" },
    { value: "ponctuelle", label: "Ponctuelle", hint: "Depense unique" },
  ];

/**
 * Le statut qui declenche une charge par commande.
 *
 * "confirmee" vise toute commande qui est **passee par** la
 * confirmation, livrees et retournees comprises : l'agent a ete paye
 * pour cet appel, quoi qu'il advienne du colis ensuite. Ne viser que
 * les commandes encore au statut confirme ferait echapper chaque
 * livraison a son propre cout de confirmation, et gonflerait le profit.
 */
export type AppliesTo =
  | "confirmee"
  | "expediee"
  | "livree"
  | "retournee"
  | "toutes";

export const APPLIES_TO: { value: AppliesTo; label: string; hint: string }[] = [
  {
    value: "confirmee",
    label: "Commandes confirmees",
    hint: "y compris celles livrees ou retournees ensuite",
  },
  {
    value: "livree",
    label: "Commandes livrees",
    hint: "remises au client, uniquement",
  },
  {
    value: "expediee",
    label: "Commandes expediees",
    hint: "des qu'un code de suivi existe",
  },
  {
    value: "retournee",
    label: "Commandes retournees",
    hint: "retours, refus, hors zone",
  },
  { value: "toutes", label: "Toutes les commandes", hint: "y compris les faux numeros" },
];

export type Periodicity = "mensuelle" | "annuelle";

export const PLATFORMS = ["Facebook", "Instagram", "TikTok", "Google", "Snapchat", "Autre"];

export const EXPENSE_CATEGORIES = [
  "Achat produit",
  "Livraison",
  "Marketing",
  "Salaires",
  "Loyer",
  "Logiciels",
  "Emballage",
  "Confirmation",
  "Autre",
];

export type Expense = {
  id: string;
  type: ExpenseType;
  label: string;
  category?: string;
  note?: string;
  amount: number;
  currency: string;
  exchangeRate: number;
  amountMad: number;
  appliesToStatus?: AppliesTo;
  productId?: string;
  /** Nom du produit vise, pour l'affichage seul. */
  productName?: string;
  periodicity?: Periodicity;
  platform?: string;
  startDate: string;
  endDate?: string;
  isActive: boolean;
  createdBy?: string;
  createdAt: string;
};

/** Ce qu'un formulaire envoie. Le serveur calcule `amount_mad`. */
export type ExpenseInput = {
  type: ExpenseType;
  label: string;
  category?: string;
  note?: string;
  amount: number;
  currency?: string;
  exchangeRate?: number;
  appliesToStatus?: AppliesTo;
  productId?: string | null;
  periodicity?: Periodicity;
  platform?: string;
  startDate: string;
  endDate?: string | null;
  isActive?: boolean;
};

/**
 * Le montant en dirhams.
 *
 * Le taux est saisi a la main et fige avec la depense : une campagne
 * payee en dollars l'a ete au cours du jour, et recalculer au cours
 * d'aujourd'hui ferait changer le profit d'un mois clos.
 */
export function toMad(amount: number, rate: number): number {
  return Math.round(amount * rate * 100) / 100;
}

/**
 * Montant ramene au mois.
 *
 * Une charge annuelle se divise par douze plutot que de peser sur le
 * mois ou elle est payee : une licence reglee en janvier sert toute
 * l'annee, et l'imputer entierement a janvier rendrait ce mois
 * deficitaire et les onze suivants trop beaux.
 */
export function monthlyAmount(amountMad: number, periodicity?: Periodicity): number {
  return periodicity === "annuelle"
    ? Math.round((amountMad / 12) * 100) / 100
    : amountMad;
}

/** La depense couvre-t-elle ce jour ? Une fin absente vaut "toujours". */
export function coversDay(expense: Expense, day: string): boolean {
  if (!expense.isActive) return false;
  if (day < expense.startDate) return false;
  return !expense.endDate || day <= expense.endDate;
}
