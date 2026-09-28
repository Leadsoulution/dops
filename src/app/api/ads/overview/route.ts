import { NextResponse, type NextRequest } from "next/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";
import { getAdsOverview } from "@/lib/supabase/ads";

/**
 * Les chiffres d'une plateforme sur une periode.
 *
 * Reserve aux administrateurs, comme les comptes eux-memes : la
 * depense publicitaire n'a pas a circuler dans l'equipe de
 * confirmation.
 */

export async function GET(request: NextRequest) {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }
  const profile = await getSessionProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non connecte." }, { status: 401 });
  }
  if (profile.role !== "Admin") {
    return NextResponse.json(
      { error: "Reserve aux administrateurs." },
      { status: 403 }
    );
  }

  try {
    const params = new URL(request.url).searchParams;
    const platform = params.get("platform");
    return NextResponse.json(
      await getAdsOverview(
        params.get("from") ?? undefined,
        params.get("to") ?? undefined,
        platform === "meta" || platform === "tiktok" ? platform : undefined
      )
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}
