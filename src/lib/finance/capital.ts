/**
 * Le capital : l'argent qui est reellement sur le compte.
 *
 * Le profit et la tresorerie ne disent pas la meme chose, et les
 * melanger a ruine plus d'un commerce rentable. Un carton d'emballage
 * achete par mille sort mille fois son prix de la banque le jour de
 * l'achat, mais ne coute que son unite a chaque commande : le compter
 * deux fois dans le profit le ferait paraitre perdant un mois, puis
 * trop beau les suivants.
 *
 * Ces mouvements ne sont donc jamais lus par le calcul du profit. Ils
 * ne repondent qu'a une question : combien reste-t-il en banque.
 */

/**
 * Premier jour ou une publicite sort du capital.
 *
 * Les budgets anterieurs ont deja ete payes : ils sont dans le solde
 * qu'on saisit en ouvrant le carnet. Les redescendre les compterait
 * une seconde fois, et le compte paraitrait vide alors qu'il ne l'est
 * pas.
 */
export const CAPITAL_DEPUIS = "2026-10-24";

export type Direction = "entree" | "sortie";

/** Les natures de mouvement, pour s'y retrouver dans le carnet. */
export const CAPITAL_CATEGORIES = [
  "Apport",
  "Achat stock",
  "Emballage",
  "Materiel",
  "Versement transporteur",
  "Retrait",
  "Autre",
];

export type CapitalMovement = {
  id: string;
  direction: Direction;
  label: string;
  category?: string;
  note?: string;
  amountMad: number;
  /** Jour ou l'argent a quitte le compte ou y est entre. */
  happenedOn: string;
  createdAt: string;
};

export type CapitalMovementInput = {
  direction: Direction;
  label: string;
  category?: string | null;
  note?: string | null;
  amountMad: number;
  happenedOn: string;
};

/**
 * Une ligne du carnet.
 *
 * Deux origines s'y melangent : ce qui est saisi ici, et les budgets
 * publicitaires deja saisis ailleurs. Les publicites sont reprises
 * telles quelles plutot que ressaisies — les ressaisir donnerait deux
 * verites a tenir a jour, et c'est toujours la deuxieme qu'on oublie.
 */
export type CapitalLine = {
  id: string;
  date: string;
  label: string;
  detail?: string;
  direction: Direction;
  amount: number;
  source: "manuel" | "publicite";
};

type Publicite = {
  id: string;
  label: string;
  platform?: string;
  amountMad: number;
  startDate: string;
};

/**
 * Le carnet complet, du plus recent au plus ancien.
 *
 * Une publicite sort de la banque le jour ou elle est engagee, en une
 * fois : le profit, lui, l'etale sur la duree de la campagne. C'est la
 * difference entre payer et consommer, et c'est pour cela que les deux
 * calculs ne peuvent pas partager la meme ligne.
 *
 * Une campagne desactivee reste comptee : elle a ete payee, et la
 * desactiver n'a pas rendu l'argent. Celles engagees avant l'ouverture
 * du carnet, en revanche, ne le sont pas : elles sont deja dans le
 * solde saisi au depart.
 */
export function capitalLines(
  movements: CapitalMovement[],
  publicites: Publicite[],
  /** Parametre pour que les tests ne dependent pas du jour reel. */
  depuis: string = CAPITAL_DEPUIS
): CapitalLine[] {
  const lignes: CapitalLine[] = [
    ...movements.map((m) => ({
      id: m.id,
      date: m.happenedOn,
      label: m.label,
      detail: m.category,
      direction: m.direction,
      amount: m.amountMad,
      source: "manuel" as const,
    })),
    ...publicites
      .filter((p) => p.startDate >= depuis)
      .map((p) => ({
        id: `pub:${p.id}`,
        date: p.startDate,
        label: p.label,
        detail: p.platform ?? "Publicite",
        direction: "sortie" as const,
        amount: p.amountMad,
        source: "publicite" as const,
      })),
  ];
  // A egalite de date, les sorties d'abord : c'est l'ordre qui montre
  // le solde le plus bas du jour, celui qui decide si le cheque passe.
  return lignes.sort(
    (a, b) =>
      b.date.localeCompare(a.date) || a.direction.localeCompare(b.direction)
  );
}

export type CapitalSummary = {
  entrees: number;
  sorties: number;
  /** Part des sorties qui vient des budgets publicitaires. */
  sortiesPublicite: number;
  solde: number;
};

export function capitalSummary(lignes: CapitalLine[]): CapitalSummary {
  let entrees = 0;
  let sorties = 0;
  let sortiesPublicite = 0;
  for (const l of lignes) {
    if (l.direction === "entree") {
      entrees += l.amount;
      continue;
    }
    sorties += l.amount;
    if (l.source === "publicite") sortiesPublicite += l.amount;
  }
  const arrondi = (n: number) => Math.round(n * 100) / 100;
  return {
    entrees: arrondi(entrees),
    sorties: arrondi(sorties),
    sortiesPublicite: arrondi(sortiesPublicite),
    solde: arrondi(entrees - sorties),
  };
}

/** Ce qui manque pour qu'un mouvement veuille dire quelque chose. */
export function mouvementInvalide(
  input: Partial<CapitalMovementInput>
): string | null {
  if (input.direction !== "entree" && input.direction !== "sortie") {
    return "Sens du mouvement manquant.";
  }
  if (!input.label?.trim()) return "Libelle manquant.";
  if (!Number.isFinite(input.amountMad) || (input.amountMad ?? 0) <= 0) {
    return "Montant invalide.";
  }
  if (!input.happenedOn) return "Date manquante.";
  return null;
}
