import { NextRequest, NextResponse } from "next/server";
import {
  carrierCounts,
  getCarrierRouting,
  saveCarrierRouting,
  type CarrierRouting,
} from "@/lib/supabase/carriers";
import { getSessionProfile } from "@/lib/supabase/auth";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";
import { CARRIERS, type CarrierId } from "@/lib/carriers/registry";

/**
 * La repartition des envois entre transporteurs.
 *
 * En lecture pour tout le monde — l'ecran des integrations l'affiche —
 * et en ecriture pour les seuls administrateurs : changer la
 * repartition deplace de l'argent d'un transporteur a l'autre.
 */

export async function GET() {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }
  try {
    const [routing, counts] = await Promise.all([
      getCarrierRouting(),
      carrierCounts(),
    ]);
    return NextResponse.json({ routing, counts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }
  const profile = await getSessionProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non connecte." }, { status: 401 });
  }
  if (profile.role !== "Admin") {
    return NextResponse.json(
      { error: "Seul un administrateur peut changer la repartition." },
      { status: 403 }
    );
  }

  let corps: Partial<CarrierRouting>;
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const connus = CARRIERS.map((c) => c.id);
  if (!corps.default || !connus.includes(corps.default)) {
    return NextResponse.json(
      { error: "Transporteur par defaut inconnu." },
      { status: 400 }
    );
  }

  const shares = { forcelog: 0, speedaf: 0 } as Record<CarrierId, number>;
  for (const id of connus) {
    const valeur = Number(corps.shares?.[id] ?? 0);
    if (!Number.isFinite(valeur) || valeur < 0 || valeur > 100) {
      return NextResponse.json(
        { error: `Part invalide pour ${id} : attendu entre 0 et 100.` },
        { status: 400 }
      );
    }
    shares[id] = Math.round(valeur);
  }

  // Tout a zero n'enverrait plus rien nulle part : on refuse plutot que
  // de bloquer les expeditions en silence.
  if (connus.every((id) => shares[id] === 0)) {
    return NextResponse.json(
      { error: "Au moins un transporteur doit avoir une part." },
      { status: 400 }
    );
  }

  // Le tarif de livraison de chacun : il s'affiche sur la commande et
  // ne depend que du transporteur.
  const actuel = await getCarrierRouting();
  const tariffs = { ...actuel.tariffs };
  for (const id of connus) {
    const valeur = Number(corps.tariffs?.[id]);
    if (corps.tariffs?.[id] === undefined) continue;
    if (!Number.isFinite(valeur) || valeur < 0 || valeur > 10000) {
      return NextResponse.json(
        { error: `Tarif invalide pour ${id}.` },
        { status: 400 }
      );
    }
    tariffs[id] = Math.round(valeur * 100) / 100;
  }

  try {
    await saveCarrierRouting({ default: corps.default, shares, tariffs });
    return NextResponse.json(await getCarrierRouting().then((routing) => ({ routing })));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}
