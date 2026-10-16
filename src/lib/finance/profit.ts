import {
  monthlyAmount,
  type AppliesTo,
  type Expense,
  type ExpenseType,
} from "./expense-types";

/**
 * Le profit, a partir des charges saisies et des commandes livrees.
 *
 * La page Finance affichait des chiffres d'exemple — un revenu de
 * vingt-sept millions, un profit de moins vingt-huit millions — ecrits
 * en dur a la creation de la maquette. Ils ne venaient de rien et ne
 * bougeaient jamais. Les vrais chiffres sont dans les charges saisies
 * et dans les commandes remises au client : c'est ce que ce module
 * rassemble.
 *
 * Deux regles gouvernent tout le reste :
 *
 * - le revenu est l'argent encaisse a la livraison, arrondi comme le
 *   livreur le reclame. Une commande confirmee n'a rien rapporte tant
 *   qu'elle n'est pas remise ;
 * - une charge ne pese que sur la periode qu'elle couvre, au prorata
 *   des jours. Un loyer commence le 15 ne compte pas pour un mois
 *   entier, et une charge par commande ne compte que les commandes qui
 *   l'ont reellement declenchee.
 *
 * Module pur : la lecture de la base appartient a l'appelant.
 */

/** Ce qu'une commande apporte au calcul. */
export type OrderFact = {
  /** Jour marocain ou la commande est arrivee. */
  createdDay: string;
  /** Jour marocain de la remise au client, pour celles qui l'ont ete. */
  deliveredDay?: string;
  /** Passee par la confirmation, meme si elle a ete livree depuis. */
  confirmed: boolean;
  /** Un colis existe chez le transporteur. */
  shipped: boolean;
  delivered: boolean;
  /** Retour, refus, annulation, hors zone : le colis ne sera pas remis. */
  returned: boolean;
  /** Produits du catalogue qu'elle contient. */
  productIds: string[];
  /** Encaisse a la remise, arrondi comme l'application l'affiche. */
  revenue: number;
};

/** Une charge, ramenee a ce qu'elle a coute sur la periode. */
export type ExpenseLine = {
  id: string;
  label: string;
  type: ExpenseType;
  category?: string;
  amount: number;
  /** Commandes qui l'ont declenchee, pour une charge par commande. */
  orders?: number;
  /** Cout unitaire, pour une charge par commande. */
  unit?: number;
};

export type FinanceSummary = {
  from: string;
  to: string;
  /** Encaisse sur les commandes livrees de la periode. */
  revenue: number;
  delivered: number;
  expenses: number;
  profit: number;
  /** Profit rapporte a une commande livree. Nul sans livraison. */
  profitPerDelivered: number;
  /** Part du revenu qui reste, en pourcentage. */
  margin: number;
  byType: Record<ExpenseType, number>;
  lines: ExpenseLine[];
};

const sou = (v: number) => Math.round(v * 100) / 100;

const jour = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
};

const JOUR_MS = 86_400_000;

/** Nombre de jours communs a deux intervalles de dates, bornes comprises. */
export function overlapDays(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): number {
  const debut = Math.max(jour(aStart), jour(bStart));
  const fin = Math.min(jour(aEnd), jour(bEnd));
  if (fin < debut) return 0;
  return Math.round((fin - debut) / JOUR_MS) + 1;
}

/** Les mois "AAAA-MM" touches par une periode, du plus ancien au dernier. */
export function monthsIn(from: string, to: string): string[] {
  const mois: string[] = [];
  let [y, m] = [Number(from.slice(0, 4)), Number(from.slice(5, 7))];
  const dernier = `${to.slice(0, 7)}`;
  for (let garde = 0; garde < 600; garde += 1) {
    const courant = `${y}-${String(m).padStart(2, "0")}`;
    mois.push(courant);
    if (courant >= dernier) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return mois;
}

/** Premier et dernier jour d'un mois "AAAA-MM". */
export function monthSpan(month: string): { first: string; last: string } {
  const [y, m] = month.split("-").map(Number);
  const dernier = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    first: `${month}-01`,
    last: `${month}-${String(dernier).padStart(2, "0")}`,
  };
}

const maxDay = (a: string, b: string) => (a > b ? a : b);
const minDay = (a: string, b: string) => (a < b ? a : b);

/** Le statut vise est-il celui par lequel cette commande est passee ? */
export function matchesStatus(fact: OrderFact, applies: AppliesTo): boolean {
  switch (applies) {
    case "livree":
      return fact.delivered;
    case "retournee":
      return fact.returned;
    case "expediee":
      return fact.shipped;
    case "confirmee":
      return fact.confirmed;
    case "toutes":
      return true;
  }
}

/**
 * Le jour qui date la commande pour cette charge.
 *
 * Une charge de livraison se rattache au jour de la remise, pas a
 * celui de la commande : une commande de septembre livree en octobre
 * coute en octobre, et c'est ce mois-la qui doit la porter.
 */
export function dayOf(fact: OrderFact, applies: AppliesTo): string {
  if (applies === "livree" || applies === "retournee") {
    return fact.deliveredDay ?? fact.createdDay;
  }
  return fact.createdDay;
}

/** La charge vise-t-elle un produit que cette commande contient ? */
function concerne(fact: OrderFact, productId?: string): boolean {
  return !productId || fact.productIds.includes(productId);
}

/**
 * Ce qu'une charge a coute sur la periode.
 *
 * Trois regimes, parce que trois natures de depense :
 *
 * - par commande : le cout unitaire, autant de fois qu'il y a eu de
 *   commandes a le declencher ;
 * - recurrente : le montant mensuel, au prorata des jours ou la charge
 *   etait en vigueur. Un loyer commence le 15 ne pese que pour la
 *   moitie du mois ;
 * - ponctuelle ou publicite : le montant, une fois, le jour ou il a ete
 *   engage. Une campagne saisie pour trente mille dirhams les a coutes
 *   ce jour-la, pas chaque mois suivant.
 */
export function expenseOnPeriod(
  expense: Expense,
  facts: OrderFact[],
  from: string,
  to: string
): ExpenseLine | null {
  if (!expense.isActive) return null;

  const debut = expense.startDate;
  const fin = expense.endDate ?? to;
  if (debut > to || fin < from) return null;

  const base: ExpenseLine = {
    id: expense.id,
    label: expense.label,
    type: expense.type,
    category: expense.category,
    amount: 0,
  };

  if (expense.type === "par_commande") {
    const applies = expense.appliesToStatus ?? "livree";
    const orders = facts.filter((f) => {
      if (!matchesStatus(f, applies)) return false;
      if (!concerne(f, expense.productId)) return false;
      const j = dayOf(f, applies);
      return j >= from && j <= to && j >= debut && j <= fin;
    }).length;
    return {
      ...base,
      orders,
      unit: expense.amountMad,
      amount: sou(expense.amountMad * orders),
    };
  }

  if (expense.type === "fixe" || expense.type === "variable") {
    const parMois = monthlyAmount(expense.amountMad, expense.periodicity);
    let total = 0;
    for (const mois of monthsIn(from, to)) {
      const { first, last } = monthSpan(mois);
      const jours = overlapDays(first, last, maxDay(from, debut), minDay(to, fin));
      if (jours === 0) continue;
      const duMois = overlapDays(first, last, first, last);
      total += (parMois * jours) / duMois;
    }
    return { ...base, amount: sou(total) };
  }

  // Ponctuelle et publicite : une fois, le jour de l'engagement.
  const engage = debut >= from && debut <= to;
  return engage ? { ...base, amount: sou(expense.amountMad) } : null;
}

/** Le compte complet d'une periode. */
export function financeSummary(
  facts: OrderFact[],
  expenses: Expense[],
  from: string,
  to: string
): FinanceSummary {
  const livrees = facts.filter(
    (f) => f.delivered && (f.deliveredDay ?? f.createdDay) >= from && (f.deliveredDay ?? f.createdDay) <= to
  );
  const revenue = sou(livrees.reduce((s, f) => s + f.revenue, 0));

  const lines = expenses
    .map((e) => expenseOnPeriod(e, facts, from, to))
    .filter((l): l is ExpenseLine => l !== null && l.amount !== 0);

  const byType: Record<ExpenseType, number> = {
    par_commande: 0,
    fixe: 0,
    variable: 0,
    publicite: 0,
    ponctuelle: 0,
  };
  for (const l of lines) byType[l.type] = sou(byType[l.type] + l.amount);

  const depenses = sou(lines.reduce((s, l) => s + l.amount, 0));
  const profit = sou(revenue - depenses);

  return {
    from,
    to,
    revenue,
    delivered: livrees.length,
    expenses: depenses,
    profit,
    // Un profit par commande n'a de sens que s'il y a eu des
    // livraisons : sans elles, le montant serait une division par zero
    // deguisee en resultat.
    profitPerDelivered: livrees.length > 0 ? sou(profit / livrees.length) : 0,
    margin: revenue > 0 ? Math.round((profit / revenue) * 100) : 0,
    byType,
    lines: lines.sort((a, b) => b.amount - a.amount),
  };
}

/** Le meme compte, mois par mois, pour la courbe. */
export function monthlyBreakdown(
  facts: OrderFact[],
  expenses: Expense[],
  months: string[]
): { month: string; revenue: number; expenses: number; profit: number }[] {
  return months.map((mois) => {
    const { first, last } = monthSpan(mois);
    const bilan = financeSummary(facts, expenses, first, last);
    return {
      month: mois,
      revenue: bilan.revenue,
      expenses: bilan.expenses,
      profit: bilan.profit,
    };
  });
}
