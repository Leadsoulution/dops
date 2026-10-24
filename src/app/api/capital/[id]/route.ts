import { NextResponse, type NextRequest } from "next/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";
import {
  deleteCapitalMovement,
  updateCapitalMovement,
} from "@/lib/supabase/capital";
import {
  mouvementInvalide,
  type CapitalMovementInput,
} from "@/lib/finance/capital";

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
  ctx: RouteContext<"/api/capital/[id]">
) {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }
  const garde = await admin();
  if ("error" in garde) {
    return NextResponse.json({ error: garde.error }, { status: garde.status });
  }
  const { id } = await ctx.params;

  let corps: Partial<CapitalMovementInput>;
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }
  // Une correction porte sur le mouvement entier : le formulaire
  // renvoie tous les champs, et les valider ensemble evite un
  // mouvement a zero dirham ou sans date.
  const probleme = mouvementInvalide(corps);
  if (probleme) return NextResponse.json({ error: probleme }, { status: 400 });

  try {
    return NextResponse.json({
      movement: await updateCapitalMovement(id, corps),
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
  ctx: RouteContext<"/api/capital/[id]">
) {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }
  const garde = await admin();
  if ("error" in garde) {
    return NextResponse.json({ error: garde.error }, { status: garde.status });
  }
  const { id } = await ctx.params;
  try {
    await deleteCapitalMovement(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}
