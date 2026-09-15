import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { getSupabaseServerClient, isSupabaseServerConfigured } from "@/lib/supabase/server";

/**
 * Compteurs de l'en-tete.
 *
 * Comptes en base plutot que calcules sur une liste rapatriee :
 * l'en-tete est present sur toutes les pages, et telecharger toutes les
 * commandes pour en compter trois chiffres serait absurde.
 *
 * "Confirmees" reunit Confirme et EXPIDER, comme l'onglet du meme nom :
 * ce sont les commandes acceptees, en route vers le transporteur.
 */
const CONFIRMED = ["Confirme", "EXPIDER"];

export async function GET() {
  const profile = await getSessionProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non connecte." }, { status: 401 });
  }
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }

  try {
    const supabase = getSupabaseServerClient();

    // `head: true` ne ramene que le compte, pas les lignes.
    const [total, confirmees] = await Promise.all([
      supabase.from("leads").select("id", { count: "exact", head: true }),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .in("status", CONFIRMED),
    ]);

    if (total.error) throw new Error(total.error.message);
    if (confirmees.error) throw new Error(confirmees.error.message);

    const totalCount = total.count ?? 0;
    const confirmedCount = confirmees.count ?? 0;

    return NextResponse.json({
      total: totalCount,
      confirmees: confirmedCount,
      nonConfirmees: totalCount - confirmedCount,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}
