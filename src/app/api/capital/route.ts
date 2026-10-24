import { NextResponse, type NextRequest } from "next/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";
import {
  createCapitalMovement,
  listCapitalMovements,
} from "@/lib/supabase/capital";
import {
  mouvementInvalide,
  type CapitalMovementInput,
} from "@/lib/finance/capital";

/**
 * Le carnet de banque. Reserve aux administrateurs, comme le reste de
 * la Finance : le solde du compte ne regarde pas l'equipe d'appel.
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
    return NextResponse.json({ movements: await listCapitalMovements() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }
  const garde = await admin();
  if ("error" in garde) {
    return NextResponse.json({ error: garde.error }, { status: garde.status });
  }

  let corps: Partial<CapitalMovementInput>;
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }
  const probleme = mouvementInvalide(corps);
  if (probleme) return NextResponse.json({ error: probleme }, { status: 400 });

  try {
    const movement = await createCapitalMovement(
      corps as CapitalMovementInput,
      garde.profile.id
    );
    return NextResponse.json({ movement }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}
