import { NextRequest, NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";
import {
  deliverableKeys,
  importSpeedafCities,
} from "@/lib/supabase/carrier-cities";
import { CARRIERS, type CarrierId } from "@/lib/carriers/registry";

/**
 * Les villes qu'un transporteur sait livrer.
 *
 * La lecture rend les cles de notre dictionnaire, pas les noms du
 * transporteur : l'ecran compare la ville d'une commande a cette
 * liste, et la ville d'une commande est la notre.
 *
 * L'import, reserve aux administrateurs, va rechercher le referentiel
 * chez le transporteur et le rapproche du notre.
 */

function estConnu(carrier: string | null): carrier is CarrierId {
  return CARRIERS.some((c) => c.id === carrier);
}

export async function GET(request: NextRequest) {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }
  const carrier = request.nextUrl.searchParams.get("carrier");
  if (!estConnu(carrier)) {
    return NextResponse.json({ error: "Transporteur inconnu." }, { status: 400 });
  }
  try {
    const cles = await deliverableKeys(carrier);
    return NextResponse.json({ carrier, keys: [...cles] });
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
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Non connecte." }, { status: 401 });
  if (profile.role !== "Admin") {
    return NextResponse.json(
      { error: "Reserve aux administrateurs." },
      { status: 403 }
    );
  }
  const carrier = request.nextUrl.searchParams.get("carrier");
  if (carrier !== "speedaf") {
    return NextResponse.json(
      {
        error:
          "Seul Speedaf s'importe : les villes ForceLog vivent dans le dictionnaire.",
      },
      { status: 400 }
    );
  }
  try {
    return NextResponse.json(await importSpeedafCities());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 502 }
    );
  }
}
