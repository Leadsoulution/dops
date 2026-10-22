import "server-only";
import { getSupabaseServerClient } from "./server";
import { fetchAll } from "./page";
import { listExpenses } from "./expenses";
import { amountValue } from "@/lib/amount";
import { moroccoDate } from "@/lib/morocco-day";
import { orderLines, type CatalogueEntry } from "@/lib/order-lines";
import {
  adResults,
  financeSummary,
  resolveAdWindows,
  monthlyBreakdown,
  monthsIn,
  type AdResult,
  type FinanceSummary,
  type OrderFact,
} from "@/lib/finance/profit";

/**
 * Les chiffres de la page Finance, pris sur les vraies commandes et les
 * vraies charges.
 *
 * La page en affichait d'inventes depuis la maquette. Tout part
 * desormais d'ici : le revenu des commandes remises au client, les
 * charges telles qu'elles ont ete saisies, et ce qui reste entre les
 * deux.
 */

const DELIVERED = "DELIVERED";

/** Codes qui disent qu'un colis ne sera pas remis. Les memes qu'ailleurs. */
const FAILED = new Set(["RETURNED", "REFUSE", "CANCELED", "OUT_OF_AREA"]);

/** Nombre de mois montres par la courbe. */
const MOIS_COURBE = 6;

/**
 * Premier jour compte dans les finances.
 *
 * Ce qui precede appartient a une periode de mise en place : charges
 * saisies apres coup, budgets publicitaires reconstitues, commandes de
 * test. Les melanger a la comptabilite reelle donnait des chiffres que
 * personne ne pouvait defendre. La page part donc de cette date, et une
 * periode choisie plus tot y est ramenee.
 */
export const DEBUT_SUIVI = "2026-10-17";

type LeadRow = {
  created_at: string;
  status: string | null;
  amount: string | null;
  product_name: string | null;
  stock_items: string | null;
  tracking_number: string | null;
  delivery_status_code: string | null;
  delivery_date: string | null;
  carrier: string | null;
};

type ProductRow = { id: string; name: string; forcelog_ref: string | null };

export type FinanceOverview = FinanceSummary & {
  /** Revenu, charges et profit mois par mois, pour la courbe. */
  monthly: { month: string; revenue: number; expenses: number; profit: number }[];
  /** Commandes encore en route : leur encaissement reste a venir. */
  inTransit: { orders: number; amount: number };
  /**
   * Les campagnes, jugees sur les commandes recues pendant leur
   * diffusion. Elles ne suivent pas la periode affichee : une campagne
   * se mesure sur sa propre fenetre, du premier au dernier jour.
   */
  ads: AdResult[];
};

/**
 * Les produits du catalogue que contient une commande.
 *
 * Par code article d'abord, qui est exact, puis par nom. Sans cette
 * correspondance, une charge visant un produit ne trouverait jamais
 * les commandes qui la declenchent.
 */
function produitsDe(
  row: LeadRow,
  catalogue: (CatalogueEntry & { id: string })[]
): string[] {
  if (catalogue.length === 0) return [];
  const lignes = orderLines(
    {
      productName: row.product_name ?? undefined,
      stockItems: row.stock_items ?? undefined,
    },
    catalogue
  );
  const ids = new Set<string>();
  for (const ligne of lignes) {
    const trouve = catalogue.find(
      (p) =>
        (ligne.ref && p.forcelogRef === ligne.ref) ||
        p.name.trim().toLowerCase() === ligne.name.trim().toLowerCase()
    );
    if (trouve) ids.add(trouve.id);
  }
  return [...ids];
}

function toFact(
  row: LeadRow,
  catalogue: (CatalogueEntry & { id: string })[]
): OrderFact {
  const code = row.delivery_status_code ?? "";
  const delivered = code === DELIVERED;
  const shipped = Boolean(row.tracking_number);
  return {
    createdDay: moroccoDate(new Date(row.created_at)),
    // Une commande partie chez le transporteur est passee par la
    // confirmation : c'est elle qui declenche l'envoi.
    confirmed: row.status === "Confirme" || shipped,
    shipped,
    delivered,
    returned: FAILED.has(code),
    productIds: produitsDe(row, catalogue),
    carrier: row.carrier ?? "forcelog",
    /*
     * Le prix de la commande, tel qu'il a ete vendu.
     *
     * C'etait le compte rond que le livreur reclame — 199 devenait 200.
     * L'ecart est d'un dirham par commande, mais ce n'est pas la meme
     * chose : le revenu de la boutique est la somme de ses prix, pas
     * celle des arrondis du transporteur.
     */
    revenue: delivered ? (amountValue(row.amount ?? undefined) ?? 0) : 0,
  };
}

/**
 * Le compte de la periode demandee, ou de tout l'historique.
 *
 * Sans bornes, la periode va de la premiere commande a aujourd'hui :
 * c'est ce que veut dire "profit total".
 */
export async function getFinanceOverview(
  from?: string,
  to?: string,
  /** Premier jour compte. Parametre pour que les tests ne dependent
   *  pas de la date de mise en route reelle. */
  debutSuivi: string = DEBUT_SUIVI
): Promise<FinanceOverview> {
  const supabase = getSupabaseServerClient();

  const [rows, expenses, produits] = await Promise.all([
    fetchAll<LeadRow>(() =>
      supabase
        .from("leads")
        .select(
          "created_at,status,amount,product_name,stock_items,tracking_number,delivery_status_code,delivery_date,carrier"
        )
        .order("created_at", { ascending: true })
    ),
    listExpenses(),
    supabase.from("products").select("id,name,forcelog_ref"),
  ]);

  const catalogue = ((produits.data ?? []) as ProductRow[]).map((p) => ({
    id: p.id,
    name: p.name,
    forcelogRef: p.forcelog_ref ?? undefined,
  }));

  const facts = rows.map((r) => toFact(r, catalogue));

  const aujourdhui = moroccoDate();
  // Jamais avant le premier jour compte : une periode demandee plus tot
  // y est ramenee, sans quoi la page melangerait la comptabilite a la
  // mise en place qui l'a precedee.
  const debut = from && from > debutSuivi ? from : debutSuivi;
  // La fin ne peut pas preceder le debut : le jour ou le suivi
  // commence, "aujourd'hui" est encore la veille, et une periode a
  // l'envers ne rendrait aucun mois.
  const demande = to ?? aujourdhui;
  const fin = demande < debut ? debut : demande;

  /*
   * Un budget publicitaire sans date de fin court jusqu'au suivant.
   *
   * Resolu une fois ici, avant tout calcul : le bilan, la courbe et le
   * resultat des campagnes doivent voir les memes fenetres, sinon les
   * trois se contredisent.
   */
  const charges = resolveAdWindows(expenses, aujourdhui);

  const bilan = financeSummary(facts, charges, debut, fin);

  // La courbe ne montre que les derniers mois : au-dela, les colonnes
  // deviennent illisibles et personne ne compare un mois a celui d'il y
  // a deux ans.
  const tous = monthsIn(debut, fin);
  const monthly = monthlyBreakdown(facts, charges, tous.slice(-MOIS_COURBE));

  /*
   * Ce qui n'est pas encore encaisse : parti, ni remis ni perdu.
   *
   * Calcule sur les lignes et non sur les faits : un fait ne porte le
   * montant que des commandes livrees, puisque c'est la seule somme
   * reellement entree en caisse.
   */
  const enRoute = rows.filter((r, i) => {
    const jour = facts[i].createdDay;
    return (
      jour >= debut &&
      jour <= fin &&
      r.tracking_number &&
      r.delivery_status_code !== DELIVERED &&
      !FAILED.has(r.delivery_status_code ?? "")
    );
  });

  return {
    ...bilan,
    monthly,
    ads: adResults(facts, charges, aujourdhui),
    inTransit: {
      orders: enRoute.length,
      amount: enRoute.reduce(
        (s, r) => s + (amountValue(r.amount ?? undefined) ?? 0),
        0
      ),
    },
  };
}
