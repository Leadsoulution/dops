import { NextRequest, NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";
import { listProductRouting, saveProductRouting } from "@/lib/supabase/carriers";
import { CARRIERS, type CarrierId } from "@/lib/carriers/registry";

/**
 * La repartition des envois, produit par produit.
 *
 * Un produit qui n'est en stock que chez un transporteur doit partir
 * chez lui, quelle que soit la regle generale. C'est ce que ce reglage
 * permet de dire, et il prime sur elle.
 */

export async function GET() {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }
  try {
    return NextResponse.json({ products: await listProductRouting() });
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
  if (!profile) return NextResponse.json({ error: "Non connecte." }, { status: 401 });
  if (profile.role !== "Admin") {
    return NextResponse.json(
      { error: "Seul un administrateur peut changer la repartition." },
      { status: 403 }
    );
  }

  let corps: { productId?: string; shares?: Record<string, number> | null };
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }
  if (!corps.productId) {
    return NextResponse.json({ error: "Produit manquant." }, { status: 400 });
  }

  let shares: Record<CarrierId, number> | null = null;
  if (corps.shares) {
    const valeurs = { forcelog: 0, speedaf: 0 } as Record<CarrierId, number>;
    for (const c of CARRIERS) {
      const v = Number(corps.shares[c.id] ?? 0);
      if (!Number.isFinite(v) || v < 0 || v > 100) {
        return NextResponse.json(
          { error: `Part invalide pour ${c.id}.` },
          { status: 400 }
        );
      }
      valeurs[c.id] = Math.round(v);
    }
    // Tout a zero n'enverrait ce produit nulle part : on le remet sous
    // la regle generale plutot que de bloquer ses commandes.
    shares = CARRIERS.every((c) => valeurs[c.id] === 0) ? null : valeurs;
  }

  try {
    await saveProductRouting(corps.productId, shares);
    return NextResponse.json({ products: await listProductRouting() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}
