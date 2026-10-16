import { NextRequest, NextResponse } from "next/server";
import { getFinanceOverview } from "@/lib/supabase/finance";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";

/**
 * Le compte de la page Finance.
 *
 * Sans bornes, il porte sur tout l'historique : c'est ce que veut dire
 * "profit total". Les bornes servent a regarder un mois en
 * particulier.
 */
export async function GET(request: NextRequest) {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }
  const { searchParams } = new URL(request.url);
  const jour = /^\d{4}-\d{2}-\d{2}$/;
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  try {
    return NextResponse.json(
      await getFinanceOverview(
        from && jour.test(from) ? from : undefined,
        to && jour.test(to) ? to : undefined
      )
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}
