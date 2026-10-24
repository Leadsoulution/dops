import { NextResponse } from "next/server";
import {
  createCity,
  deleteCities,
  listCities,
  upsertCities,
} from "@/lib/supabase/cities";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";
import { deliverableKeys } from "@/lib/supabase/carrier-cities";

/**
 * Dictionnaire des villes canoniques.
 *
 * L'acces est deja filtre par le proxy : seule une personne connectee
 * arrive ici. Contrairement aux comptes, les villes se consultent et se
 * corrigent par toute l'equipe, pas seulement par un administrateur.
 */

export async function GET() {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }
  try {
    /*
     * Qui dessert quoi, pose a cote de chaque ville.
     *
     * Le dictionnaire melange desormais les villes des deux
     * transporteurs. Sans cette indication, une ville ajoutee pour
     * Speedaf se lirait comme une ville livrable par tout le monde, et
     * la premiere commande partirait chez celui qui ne la connait pas.
     *
     * Le code ForceLog suffit pour lui ; Speedaf passe par le
     * rapprochement de sa liste, qui sait qu'une de ses zones peut en
     * couvrir deux des notres.
     */
    const [cities, chezSpeedaf] = await Promise.all([
      listCities(),
      deliverableKeys("speedaf").catch(() => new Set<string>()),
    ]);
    return NextResponse.json({
      cities: cities.map((city) => ({
        ...city,
        carriers: [
          ...(city.carrierCode ? ["forcelog"] : []),
          ...(chezSpeedaf.has(city.key) ? ["speedaf"] : []),
        ],
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // Un tableau : import en masse (fichier ou transporteur).
    if (Array.isArray(body.cities)) {
      const result = await upsertCities(body.cities);
      return NextResponse.json(result);
    }
    return NextResponse.json({ city: await createCity(body) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { ids } = await request.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "Aucune ville a supprimer." }, { status: 400 });
    }
    await deleteCities(ids);
    return NextResponse.json({ ok: true, deleted: ids.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}
