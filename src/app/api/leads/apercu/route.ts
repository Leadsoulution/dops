import { NextResponse } from "next/server";
import { listLeadApercus } from "@/lib/supabase/leads";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";

/**
 * De quoi savoir si la liste a bouge, sans la rapatrier.
 *
 * La page des commandes se rafraichit toutes les vingt secondes. Elle
 * relisait pour cela les deux mille commandes entieres : deux
 * megaoctets par tour et par onglet, le plus souvent pour constater
 * que rien n'avait change. Multiplie par les agents et par les heures,
 * c'est ce qui a epuise le quota de trafic du projet.
 *
 * Elle demande desormais ces six colonnes — un dixieme du poids — et
 * ne redemande tout que lorsqu'elles different de ce qu'elle affiche.
 */
export async function GET() {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }
  try {
    return NextResponse.json({ apercus: await listLeadApercus() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}
