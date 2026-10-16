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

const maxDay = (a: string, b: string) => (a > b ? a : b);
const minDay = (a: string, b: string) => (a < b ? a : b);

/** La date, decalee de `delta` jours. */
function shiftDay(day: string, delta: number): string {
  const d = new Date(jour(day) + delta * JOUR_MS);
  const deux = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${deux(d.getUTCMonth() + 1)}-${deux(
    d.getUTCDate()
  )}`;
}

/**
 * La fin implicite d'un budget publicitaire : la veille du suivant.
 *
 * Les budgets se saisissent au fil de l'eau — cinq cents un jour, mille
 * le lendemain — et la date de fin est rarement connue au moment ou on
 * les note. Un budget sans fin court donc jusqu'au budget suivant, et
 * le dernier jusqu'a aujourd'hui : c'est la lecture naturelle d'une
 * suite de depenses quotidiennes, et elle evite qu'un budget en
 * recouvre un autre.
 *
 * Deux budgets saisis le meme jour partagent la meme fenetre : aucun
 * des deux ne commence apres l'autre.
 */
export function resolveAdWindows(expenses: Expense[], today: string): Expense[] {
  const debuts = [
    ...new Set(
      expenses
        .filter((e) => e.type === "publicite" && e.isActive)
        .map((e) => e.startDate)
    ),
  ].sort();

  return expenses.map((e) => {
    if (e.type !== "publicite" || !e.isActive || e.endDate) return e;
    const suivant = debuts.find((d) => d > e.startDate);
    return {
      ...e,
      endDate: suivant ? shiftDay(suivant, -1) : maxDay(today, e.startDate),
    };
  });
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

  /*
   * Une campagne qui porte une date de fin est etalee sur ses jours.
   *
   * Un budget de trente mille dirhams du 1er au 30 ne pese pas
   * entierement sur le 1er : il brule jour apres jour, et une semaine
   * de cette campagne coute une semaine de budget. Sans date de fin, on
   * ne sait pas sur quoi l'etaler : le montant compte alors une fois,
   * le jour engage, comme une depense ponctuelle.
   */
  if (expense.type === "publicite" && expense.endDate) {
    const duree = overlapDays(debut, expense.endDate, debut, expense.endDate);
    const couverts = overlapDays(debut, expense.endDate, from, to);
    if (couverts === 0) return null;
    return { ...base, amount: sou((expense.amountMad * couverts) / duree) };
  }

  // Ponctuelle, et publicite sans fin : une fois, le jour de l'engagement.
  const engage = debut >= from && debut <= to;
  return engage ? { ...base, amount: sou(expense.amountMad) } : null;
}

/** Le resultat d'une campagne, mesure sur les commandes qu'elle a amenees. */
export type AdResult = {
  /** La fenetre elle-meme : "2026-09-15_2026-09-17". */
  id: string;
  label: string;
  platform?: string;
  startDate: string;
  endDate?: string;
  /** Jours de diffusion comptes dans le resultat. */
  days: number;
  /** Budget de la fenetre : la somme des montants saisis dessus. */
  spend: number;
  /** Les budgets qui composent la fenetre, pour pouvoir les corriger. */
  entries: { id: string; label: string; amount: number }[];
  /** Commandes arrivees pendant la diffusion. */
  received: number;
  confirmed: number;
  delivered: number;
  /** Encore en route : leur sort n'est pas connu. */
  pending: number;
  /** Encaisse des commandes de la campagne deja livrees. */
  revenue: number;
  /** Charges par commande declenchees par ces commandes. */
  orderCharges: number;
  profit: number;
  costPerOrder: number;
  costPerDelivered: number;
  /** Part des commandes recues qui a ete livree, en pourcentage. */
  deliveryRate: number;
};

/**
 * Ce qu'une campagne a rapporte.
 *
 * Mesuree sur les commandes **recues pendant la diffusion**, et non sur
 * celles livrees pendant cette periode. La difference n'est pas un
 * detail : une commande arrivee le 30 septembre est livree en octobre,
 * et la compter en octobre attribuerait au budget d'octobre une vente
 * payee par celui de septembre. Une campagne se juge sur ce qu'elle a
 * fait entrer, meme si l'argent arrive plus tard.
 *
 * Le revenu ne compte que les commandes de la campagne effectivement
 * remises au client : celles encore en route sont annoncees a part,
 * parce qu'elles peuvent encore echouer.
 */
export function adResults(
  facts: OrderFact[],
  expenses: Expense[],
  today: string
): AdResult[] {
  const charges = expenses.filter(
    (e) => e.isActive && e.type === "par_commande"
  );

  /*
   * Les budgets sont regroupes par fenetre, et non pris un a un.
   *
   * Deux budgets notes le meme jour couvrent les memes commandes : les
   * mesurer separement compterait deux fois la meme cohorte, et la
   * ligne de total annoncerait plus de commandes qu'il n'en est arrive.
   * Une fenetre, une cohorte, un resultat — et le budget de la journee
   * est la somme de ce qui a ete saisi dessus.
   */
  const fenetres = new Map<string, { debut: string; fin: string; pubs: Expense[] }>();
  for (const pub of expenses) {
    if (pub.type !== "publicite" || !pub.isActive) continue;
    const debut = pub.startDate;
    const fin = pub.endDate ?? today;
    const cle = `${debut}_${fin}`;
    const existante = fenetres.get(cle);
    if (existante) existante.pubs.push(pub);
    else fenetres.set(cle, { debut, fin, pubs: [pub] });
  }

  return [...fenetres.entries()]
    .map(([cle, { debut, fin, pubs }]) => {
      const produit = pubs.every((p) => p.productId === pubs[0].productId)
        ? pubs[0].productId
        : undefined;
      const cohorte = facts.filter(
        (f) =>
          f.createdDay >= debut &&
          f.createdDay <= fin &&
          concerne(f, produit)
      );

      const livrees = cohorte.filter((f) => f.delivered);
      const revenue = sou(livrees.reduce((s, f) => s + f.revenue, 0));

      // Les charges par commande que cette cohorte a declenchees : une
      // campagne ne porte pas que son budget, elle porte aussi
      // l'emballage et la livraison des commandes qu'elle a amenees.
      const orderCharges = sou(
        charges.reduce((total, charge) => {
          const applies = charge.appliesToStatus ?? "livree";
          const chargeFin = charge.endDate ?? "9999-12-31";
          const n = cohorte.filter((f) => {
            if (!matchesStatus(f, applies)) return false;
            if (!concerne(f, charge.productId)) return false;
            const j = dayOf(f, applies);
            return j >= charge.startDate && j <= chargeFin;
          }).length;
          return total + charge.amountMad * n;
        }, 0)
      );

      const spend = sou(pubs.reduce((s, p) => s + p.amountMad, 0));
      const received = cohorte.length;
      const delivered = livrees.length;
      const plateformes = [
        ...new Set(pubs.map((p) => p.platform).filter(Boolean)),
      ];

      return {
        id: cle,
        label:
          pubs.length === 1
            ? pubs[0].label
            : `${pubs.length} budgets`,
        platform: plateformes.length === 1 ? plateformes[0] : undefined,
        startDate: debut,
        endDate: pubs[0].endDate ?? fin,
        days: overlapDays(debut, fin, debut, fin),
        spend,
        entries: pubs.map((p) => ({
          id: p.id,
          label: p.label,
          amount: p.amountMad,
        })),
        received,
        confirmed: cohorte.filter((f) => f.confirmed).length,
        delivered,
        pending: cohorte.filter((f) => !f.delivered && !f.returned).length,
        revenue,
        orderCharges,
        profit: sou(revenue - spend - orderCharges),
        costPerOrder: received > 0 ? sou(spend / received) : 0,
        costPerDelivered: delivered > 0 ? sou(spend / delivered) : 0,
        deliveryRate: received > 0 ? Math.round((delivered / received) * 100) : 0,
      };
    })
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
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
