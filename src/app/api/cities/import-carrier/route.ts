import { NextRequest, NextResponse } from "next/server";
import { importSpeedafCities } from "@/lib/supabase/carrier-cities";
import { getCities } from "@/lib/forcelog/client";
import { ForceLogApiError } from "@/lib/forcelog/types";
import { upsertCities, type CityInput } from "@/lib/supabase/cities";

/**
 * Importe les villes d'un transporteur dans le dictionnaire.
 *
 * ForceLog rend ses villes avec leurs frais de livraison, et les
 * villes deja presentes sont mises a jour — sauf celles dont le tarif
 * a ete force en interne : c'est tout l'objet d'un tarif force que de
 * resister a un reimport.
 *
 * Speedaf, lui, reste chez lui : son import rafraichit sa propre
 * liste et ne touche pas au dictionnaire.
 *
 * Il l'a longtemps alimente, et le dictionnaire a fini par connaitre
 * la meme commune sous trois ecritures — celle de ForceLog, celle de
 * l'arbre Speedaf, celle de leur feuille. L'agent les voyait toutes
 * les trois sans savoir laquelle partait. Chaque transporteur garde
 * donc sa liste, et l'ecran de commande propose celle du transporteur
 * choisi.
 *
 * Sans transporteur precise, c'est ForceLog : la route existait pour
 * lui seul, et l'ecran qui l'appelle ainsi ne doit pas changer de
 * comportement.
 */
export async function POST(request: NextRequest) {
  let carrier = "forcelog";
  try {
    const corps = await request.json();
    if (corps?.carrier === "speedaf") carrier = "speedaf";
  } catch {
    /* Pas de corps : ForceLog, comme avant. */
  }

  if (carrier === "speedaf") {
    try {
      return NextResponse.json(await importSpeedafCities());
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Erreur inattendue lors de l'import.",
        },
        { status: 502 }
      );
    }
  }

  const apiKey = process.env.FORCELOG_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Cle API ForceLog non configuree." },
      { status: 500 }
    );
  }

  try {
    const cities = await getCities(apiKey);
    const inputs: CityInput[] = Object.values(cities)
      .filter((city) => city?.NAME)
      .map((city) => ({
        name: city.NAME,
        carrierCode: city.CODE,
        tariff: Number(city.D_FEES) || 0,
        tariffSource: "transporteur" as const,
      }));

    const result = await upsertCities(inputs);
    return NextResponse.json({ ...result, total: inputs.length });
  } catch (error) {
    const message =
      error instanceof ForceLogApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Erreur inattendue lors de l'import.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
