import "server-only";
import { getSupabaseServerClient } from "./server";
import { fetchAll } from "./page";
import { toMad, type Expense, type ExpenseInput } from "@/lib/finance/expense-types";

/**
 * Les charges, en base.
 *
 * Le montant en dirhams est calcule ici et non dans le navigateur : il
 * sert de base a tous les profits, et une valeur venue du client
 * pourrait ne pas correspondre au montant et au taux enregistres a
 * cote d'elle.
 *
 * Rien n'est jamais efface sans que l'on sache ce qui part : la
 * suppression est reservee aux erreurs de saisie, et desactiver une
 * charge suffit pour qu'elle cesse de peser sans perdre le passe
 * qu'elle explique.
 */

type Row = {
  id: string;
  type: Expense["type"];
  label: string;
  category: string | null;
  note: string | null;
  amount: string | number;
  currency: string;
  exchange_rate: string | number;
  amount_mad: string | number;
  applies_to_status: Expense["appliesToStatus"] | null;
  product_id: string | null;
  periodicity: Expense["periodicity"] | null;
  platform: string | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
};

const CHAMPS =
  "id,type,label,category,note,amount,currency,exchange_rate,amount_mad," +
  "applies_to_status,product_id,periodicity,platform,start_date,end_date," +
  "is_active,created_by,created_at";

const nombre = (v: string | number) => Number(v) || 0;

/*
 * Le client type de Supabase ne connait pas cette table : ses types
 * sont generes depuis un schema qui precede la migration. La lecture
 * par tranches attend une forme precise, qu'on lui donne ici plutot
 * que de renoncer au decoupage — une table de charges grandit.
 */
type Tranche = {
  range: (
    from: number,
    to: number
  ) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;
};

function toExpense(row: Row, produits: Map<string, string>): Expense {
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    category: row.category ?? undefined,
    note: row.note ?? undefined,
    amount: nombre(row.amount),
    currency: row.currency,
    exchangeRate: nombre(row.exchange_rate),
    amountMad: nombre(row.amount_mad),
    appliesToStatus: row.applies_to_status ?? undefined,
    productId: row.product_id ?? undefined,
    productName: row.product_id ? produits.get(row.product_id) : undefined,
    periodicity: row.periodicity ?? undefined,
    platform: row.platform ?? undefined,
    startDate: row.start_date,
    endDate: row.end_date ?? undefined,
    isActive: row.is_active,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
  };
}

/** Le nom des produits vises, pour que la liste se lise sans jointure. */
async function productNames(): Promise<Map<string, string>> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from("products").select("id,name");
  return new Map(
    ((data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name])
  );
}

export async function listExpenses(): Promise<Expense[]> {
  const supabase = getSupabaseServerClient();
  const [rows, produits] = await Promise.all([
    fetchAll<Row>(
      () =>
        supabase
          .from("expenses")
          .select(CHAMPS)
          .order("start_date", { ascending: false }) as unknown as Tranche
    ),
    productNames(),
  ]);
  return rows.map((r) => toExpense(r, produits));
}

/**
 * Les champs qui n'ont de sens que pour certains types.
 *
 * Un loyer n'a pas de plateforme, une campagne n'a pas de statut
 * declencheur. Les laisser passer remplirait la table de valeurs
 * contradictoires, et un filtre par plateforme ramenerait des loyers.
 */
function champsDuType(input: ExpenseInput) {
  const { type } = input;
  return {
    applies_to_status: type === "par_commande" ? (input.appliesToStatus ?? "livree") : null,
    product_id:
      type === "par_commande" || type === "publicite" ? (input.productId ?? null) : null,
    periodicity:
      type === "fixe" || type === "variable" ? (input.periodicity ?? "mensuelle") : null,
    platform: type === "publicite" ? (input.platform ?? null) : null,
    // Une depense ponctuelle tient en un jour : sa fin est son debut,
    // sans quoi elle pesserait indefiniment sur tous les mois suivants.
    end_date: type === "ponctuelle" ? input.startDate : (input.endDate ?? null),
  };
}

function toRow(input: ExpenseInput, userId?: string) {
  const currency = input.currency ?? "MAD";
  const rate = currency === "MAD" ? 1 : (input.exchangeRate ?? 1);
  return {
    type: input.type,
    label: input.label.trim(),
    category: input.category?.trim() || null,
    note: input.note?.trim() || null,
    amount: input.amount,
    currency,
    exchange_rate: rate,
    amount_mad: toMad(input.amount, rate),
    start_date: input.startDate,
    is_active: input.isActive ?? true,
    ...champsDuType(input),
    ...(userId ? { created_by: userId } : {}),
    updated_at: new Date().toISOString(),
  };
}

export async function createExpense(
  input: ExpenseInput,
  userId?: string
): Promise<Expense> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("expenses")
    .insert(toRow(input, userId))
    .select(CHAMPS)
    .single();
  if (error) throw new Error(error.message);
  return toExpense(data as unknown as Row, await productNames());
}

export async function updateExpense(
  id: string,
  input: ExpenseInput
): Promise<Expense> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("expenses")
    .update(toRow(input))
    .eq("id", id)
    .select(CHAMPS)
    .single();
  if (error) throw new Error(error.message);
  return toExpense(data as unknown as Row, await productNames());
}

/**
 * Desactive une charge sans la perdre.
 *
 * Elle cesse de peser sur les mois a venir, mais continue d'expliquer
 * les profits deja calcules. C'est le geste courant ; la suppression
 * est reservee aux erreurs de saisie.
 */
export async function setExpenseActive(id: string, active: boolean): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("expenses")
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteExpense(id: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
