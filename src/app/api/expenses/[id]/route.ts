import { NextResponse, type NextRequest } from "next/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import {
  deleteExpense,
  setExpenseActive,
  updateExpense,
} from "@/lib/supabase/expenses";
import type { ExpenseInput } from "@/lib/finance/expense-types";

/** Modifier, desactiver ou supprimer une charge. Administrateurs seuls. */

async function admin() {
  const profile = await getSessionProfile();
  if (!profile) return { error: "Non connecte.", status: 401 as const };
  if (profile.role !== "Admin") {
    return { error: "Reserve aux administrateurs.", status: 403 as const };
  }
  return { profile };
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/expenses/[id]">
) {
  const garde = await admin();
  if ("error" in garde) {
    return NextResponse.json({ error: garde.error }, { status: garde.status });
  }
  try {
    const { id } = await context.params;
    const body = await request.json();

    // Un simple basculement actif/inactif n'a pas a renvoyer toute la
    // charge : c'est le geste courant, et le reste ne change pas.
    if (typeof body.isActive === "boolean" && !body.type) {
      await setExpenseActive(id, body.isActive);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({
      expense: await updateExpense(id, body as ExpenseInput),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/expenses/[id]">
) {
  const garde = await admin();
  if ("error" in garde) {
    return NextResponse.json({ error: garde.error }, { status: garde.status });
  }
  try {
    const { id } = await context.params;
    await deleteExpense(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}
