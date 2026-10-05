import { NextResponse, type NextRequest } from "next/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Les vues de colonnes, partagees par les administrateurs.
 *
 * Elles vivent cote serveur et non dans le navigateur : une vue posee
 * par defaut doit s'ouvrir de la meme facon sur le poste de chacun,
 * sinon ce n'est pas une vue par defaut, c'est une preference locale.
 */

const CLE = "ads-views";

export type SavedView = { name: string; columns: string[] };
type Stored = { views?: SavedView[]; defaut?: string };

async function admin() {
  const profile = await getSessionProfile();
  if (!profile) return { error: "Non connecte.", status: 401 as const };
  if (profile.role !== "Admin") {
    return { error: "Reserve aux administrateurs.", status: 403 as const };
  }
  return { profile };
}

async function lire(): Promise<Stored> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("integration_settings")
    .select("settings")
    .eq("id", CLE)
    .maybeSingle();
  return ((data as { settings: Stored } | null)?.settings ?? {}) as Stored;
}

export async function GET() {
  const garde = await admin();
  if ("error" in garde) {
    return NextResponse.json({ error: garde.error }, { status: garde.status });
  }
  try {
    const { views = [], defaut } = await lire();
    return NextResponse.json({ views, defaut: defaut ?? null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}

/**
 * Enregistre une vue, ou designe celle qui s'ouvre par defaut.
 *
 * L'ecriture relit l'etat avant de le reposer : deux administrateurs
 * qui enregistrent chacun une vue ne doivent pas effacer celle de
 * l'autre.
 */
export async function PUT(request: NextRequest) {
  const garde = await admin();
  if ("error" in garde) {
    return NextResponse.json({ error: garde.error }, { status: garde.status });
  }
  try {
    const body = await request.json();
    const actuel = await lire();
    let views = actuel.views ?? [];
    let defaut = actuel.defaut;

    if (body.save) {
      const nom = String(body.save.name ?? "").trim();
      const colonnes = Array.isArray(body.save.columns) ? body.save.columns : [];
      if (!nom) {
        return NextResponse.json({ error: "Nom manquant." }, { status: 400 });
      }
      if (colonnes.length === 0) {
        return NextResponse.json(
          { error: "Une vue sans colonne n'afficherait rien." },
          { status: 400 }
        );
      }
      // Meme nom : on remplace, sinon la liste se remplit de doublons
      // qu'on ne sait plus distinguer.
      views = [
        ...views.filter((v) => v.name !== nom),
        { name: nom, columns: colonnes as string[] },
      ];
    }

    if (body.remove) {
      views = views.filter((v) => v.name !== body.remove);
      if (defaut === body.remove) defaut = undefined;
    }

    if (body.defaut !== undefined) {
      defaut = body.defaut === null ? undefined : String(body.defaut);
    }

    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("integration_settings").upsert(
      {
        id: CLE,
        settings: { views, defaut: defaut ?? null },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (error) throw new Error(error.message);

    return NextResponse.json({ views, defaut: defaut ?? null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}
