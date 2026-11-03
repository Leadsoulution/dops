import { NextRequest, NextResponse } from "next/server";
import {
  addSpeedafCitiesToDictionary,
  importSpeedafCities,
} from "@/lib/supabase/carrier-cities";
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
 * Speedaf n'ajoute que ce qui manque : il dessert cinq cents localites
 * que ForceLog ignore, mais il ne redefinit pas celles que nous
 * connaissons deja.
 *
 * Pour lui, le referentiel est d'abord rafraichi chez le
 * transporteur. L'etape existait mais n'etait declenchee par aucun
 * ecran : le bouton versait au dictionnaire une liste vieille de
 * plusieurs semaines, et une ville nouvellement desservie n'arrivait
 * jamais. Un rafraichissement qui echoue n'annule pas le versement,
 * la liste deja en base restant exploitable.
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
      let referentiel: Awaited<ReturnType<typeof importSpeedafCities>> | null = null;
      let avertissement: string | undefined;
      try {
        referentiel = await importSpeedafCities();
      } catch (error) {
        avertissement =
          error instanceof Error
            ? `Referentiel Speedaf non rafraichi : ${error.message}`
            : "Referentiel Speedaf non rafraichi.";
      }
      const result = await addSpeedafCitiesToDictionary();
      return NextResponse.json({
        ...result,
        desservies: referentiel?.villes,
        avertissement,
      });
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
