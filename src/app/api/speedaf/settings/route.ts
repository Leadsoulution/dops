import { NextRequest, NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";
import {
  getSpeedafSettings,
  manquePourExpedier,
  saveSpeedafSettings,
  type SpeedafSettingsInput,
} from "@/lib/supabase/speedaf-settings";
import { getArea, SPEEDAF_UAT } from "@/lib/speedaf/client";

/**
 * Les identifiants Speedaf, saisis depuis l'ecran des integrations.
 *
 * La cle de signature ne ressort jamais : la lecture n'en rend que les
 * quatre derniers caracteres, assez pour reconnaitre celle qui est
 * enregistree, pas assez pour s'en servir.
 *
 * L'ecriture verifie la connexion dans la foulee en demandant la liste
 * des regions — c'est l'appel le plus leger de leur API, et il ne
 * modifie rien. Des identifiants faux se voient tout de suite, plutot
 * qu'a la premiere commande confirmee.
 */

async function admin() {
  const profile = await getSessionProfile();
  if (!profile) return { error: "Non connecte.", status: 401 as const };
  if (profile.role !== "Admin") {
    return { error: "Reserve aux administrateurs.", status: 403 as const };
  }
  return null;
}

export async function GET() {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }
  const refus = await admin();
  if (refus) return NextResponse.json({ error: refus.error }, { status: refus.status });

  const s = await getSpeedafSettings();
  if (!s) return NextResponse.json({ settings: null, ready: false });

  return NextResponse.json({
    settings: {
      environment: s.baseUrl === SPEEDAF_UAT ? "uat" : "production",
      appCode: s.appCode,
      customerCode: s.customerCode,
      platformSource: s.platformSource,
      secretHint: s.secretHint,
      senderName: s.sender.name,
      senderMobile: s.sender.mobile,
      senderAddress: s.sender.address,
      senderCity: s.sender.cityName,
      senderProvince: s.sender.provinceName,
      senderDistrict: s.sender.districtName,
      weight: s.weight,
      warehouseCode: s.warehouseCode ?? "",
    },
    ready: manquePourExpedier(s) === null,
    missing: manquePourExpedier(s),
  });
}

export async function PUT(request: NextRequest) {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }
  const refus = await admin();
  if (refus) return NextResponse.json({ error: refus.error }, { status: refus.status });

  let corps: SpeedafSettingsInput;
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const requis: [keyof SpeedafSettingsInput, string][] = [
    ["appCode", "Code application"],
    ["customerCode", "Code client"],
    ["senderName", "Nom de l'expediteur"],
    ["senderMobile", "Telephone de l'expediteur"],
    ["senderAddress", "Adresse d'expedition"],
    ["senderCity", "Ville d'expedition"],
  ];
  for (const [champ, libelle] of requis) {
    if (!String(corps[champ] ?? "").trim()) {
      return NextResponse.json({ error: `${libelle} manquant.` }, { status: 400 });
    }
  }

  try {
    await saveSpeedafSettings(corps);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }

  // Verification immediate, en lecture seule.
  const s = await getSpeedafSettings();
  if (!s) return NextResponse.json({ connected: false, message: "Reglages illisibles." });
  try {
    const provinces = await getArea(s, 1);
    return NextResponse.json({
      connected: true,
      message: `Connecte : ${provinces.length} regions lues chez Speedaf.`,
    });
  } catch (error) {
    return NextResponse.json({
      connected: false,
      message:
        error instanceof Error
          ? error.message
          : "Identifiants refuses par Speedaf.",
    });
  }
}
