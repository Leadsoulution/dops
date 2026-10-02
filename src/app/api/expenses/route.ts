import { NextResponse, type NextRequest } from "next/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";
import { createExpense, listExpenses } from "@/lib/supabase/expenses";
import type { ExpenseInput } from "@/lib/finance/expense-types";

/**
 * Les charges. Reserve aux administrateurs, comme toute la Finance :
 * les salaires et le loyer n'ont pas a circuler dans l'equipe de
 * confirmation.
 */

async function admin() {
  const profile = await getSessionProfile();
  if (!profile) return { error: "Non connecte.", status: 401 as const };
  if (profile.role !== "Admin") {
    return { error: "Reserve aux administrateurs.", status: 403 as const };
  }
  return { profile };
}

export async function GET() {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }
  const garde = await admin();
  if ("error" in garde) {
    return NextResponse.json({ error: garde.error }, { status: garde.status });
  }
  try {
    return NextResponse.json({ expenses: await listExpenses() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}

/** Les champs sans lesquels une charge ne veut rien dire. */
function invalide(input: Partial<ExpenseInput>): string | null {
  if (!input.type) return "Type de charge manquant.";
  if (!input.label?.trim()) return "Libelle manquant.";
  if (!Number.isFinite(input.amount) || (input.amount ?? 0) <= 0) {
    return "Montant invalide.";
  }
  if (!input.startDate) return "Date de debut manquante.";
  if (input.endDate && input.endDate < input.startDate) {
    return "La date de fin precede la date de debut.";
  }
  if (
    input.currency &&
    input.currency !== "MAD" &&
    (!Number.isFinite(input.exchangeRate) || (input.exchangeRate ?? 0) <= 0)
  ) {
    return "Taux de change manquant pour une devise etrangere.";
  }
  return null;
}

export async function POST(request: NextRequest) {
  const garde = await admin();
  if ("error" in garde) {
    return NextResponse.json({ error: garde.error }, { status: garde.status });
  }
  try {
    const body = (await request.json()) as ExpenseInput;
    const souci = invalide(body);
    if (souci) return NextResponse.json({ error: souci }, { status: 400 });
    return NextResponse.json({
      expense: await createExpense(body, garde.profile.id),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}
