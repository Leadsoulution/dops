import { NextResponse, type NextRequest } from "next/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";
import { getFollowUps } from "@/lib/supabase/follow-up";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { MARQUAGES_MAX } from "@/lib/follow-up";

/**
 * Les deux files de relance. Ouvertes a toute personne connectee :
 * ce sont les agents de confirmation qui les traitent.
 */

export async function GET() {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }
  const profile = await getSessionProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non connecte." }, { status: 401 });
  }
  try {
    return NextResponse.json(await getFollowUps(profile.id));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}

/**
 * Marque un dossier traite, pour la personne connectee.
 *
 * Le compteur monte d'un cran et l'heure est notee : le dossier part
 * au repos pour vingt-quatre heures, puis revient de lui-meme. Au
 * troisieme, il quitte le suivi — celui de cette personne seulement.
 * Ce qu'une agente met de cote reste du a l'autre.
 *
 * Le serveur lit le compteur et l'incremente lui-meme plutot que
 * d'accepter une valeur venue du navigateur : un onglet reste ouvert
 * une heure renverrait un chiffre perime et ferait reculer
 * l'avancement.
 */
export async function PATCH(request: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non connecte." }, { status: 401 });
  }

  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "Commande manquante." }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { data: avant, error: lecture } = await supabase
      .from("lead_follow_ups")
      .select("count")
      .eq("lead_id", id)
      .eq("user_id", profile.id)
      .maybeSingle();
    if (lecture) throw new Error(lecture.message);

    const courant = (avant as { count: number | null } | null)?.count ?? 0;
    const suivant = Math.min(courant + 1, MARQUAGES_MAX);

    const { error } = await supabase.from("lead_follow_ups").upsert(
      {
        lead_id: id,
        user_id: profile.id,
        count: suivant,
        marked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "lead_id,user_id" }
    );
    if (error) throw new Error(error.message);

    return NextResponse.json({ count: suivant });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}
