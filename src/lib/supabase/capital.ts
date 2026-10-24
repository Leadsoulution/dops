import "server-only";
import { getSupabaseServerClient } from "./server";
import { fetchAll } from "./page";
import type {
  CapitalMovement,
  CapitalMovementInput,
  Direction,
} from "@/lib/finance/capital";

/**
 * Le carnet de banque, en base.
 *
 * Table a part de `expenses`, et c'est voulu : rien ici ne doit
 * pouvoir se retrouver dans le profit par accident. Une colonne de
 * plus sur les charges aurait suffi techniquement, mais il aurait
 * fallu y penser dans chacun des calculs existants — et il aurait
 * suffi d'un oubli pour compter un achat de stock comme une perte.
 */

type Row = {
  id: string;
  direction: string;
  label: string;
  category: string | null;
  note: string | null;
  amount_mad: number | string;
  happened_on: string;
  created_at: string;
};

const COLUMNS =
  "id,direction,label,category,note,amount_mad,happened_on,created_at";

function toMovement(row: Row): CapitalMovement {
  return {
    id: row.id,
    direction: row.direction === "entree" ? "entree" : "sortie",
    label: row.label,
    category: row.category ?? undefined,
    note: row.note ?? undefined,
    amountMad: Number(row.amount_mad),
    happenedOn: row.happened_on,
    createdAt: row.created_at,
  };
}

export async function listCapitalMovements(): Promise<CapitalMovement[]> {
  const supabase = getSupabaseServerClient();
  const rows = await fetchAll<Row>(() =>
    supabase
      .from("capital_movements")
      .select(COLUMNS)
      .order("happened_on", { ascending: false })
  );
  return rows.map(toMovement);
}

function toRow(input: Partial<CapitalMovementInput>) {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.direction !== undefined) row.direction = input.direction;
  if (input.label !== undefined) row.label = input.label.trim();
  if (input.category !== undefined) row.category = input.category || null;
  if (input.note !== undefined) row.note = input.note || null;
  if (input.amountMad !== undefined) row.amount_mad = input.amountMad;
  if (input.happenedOn !== undefined) row.happened_on = input.happenedOn;
  return row;
}

export async function createCapitalMovement(
  input: CapitalMovementInput,
  createdBy?: string
): Promise<CapitalMovement> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("capital_movements")
    .insert({ ...toRow(input), created_by: createdBy ?? null })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return toMovement(data as Row);
}

export async function updateCapitalMovement(
  id: string,
  changes: Partial<CapitalMovementInput>
): Promise<CapitalMovement> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("capital_movements")
    .update(toRow(changes))
    .eq("id", id)
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return toMovement(data as Row);
}

export async function deleteCapitalMovement(id: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("capital_movements")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export function directionValide(v: unknown): v is Direction {
  return v === "entree" || v === "sortie";
}
