import { NextResponse, type NextRequest } from "next/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";
import {
  createArrival,
  createPayment,
  createPurchase,
  createSupplier,
  listArrivals,
  listPayments,
  listPurchases,
  listSuppliers,
  updateSupplier,
} from "@/lib/supabase/suppliers";

/**
 * Fournisseurs, achats et reglements.
 *
 * Reserve aux administrateurs : ce que coute la marchandise n'a pas a
 * circuler dans l'equipe d'appel, pas plus que les salaires.
 */

async function admin() {
  const profile = await getSessionProfile();
  if (!profile) return { error: "Non connecte.", status: 401 as const };
  if (profile.role !== "Admin") {
    return { error: "Reserve aux administrateurs.", status: 403 as const };
  }
  return { profile };
}

export async function GET(request: NextRequest) {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }
  const garde = await admin();
  if ("error" in garde) {
    return NextResponse.json({ error: garde.error }, { status: garde.status });
  }
  try {
    const id = new URL(request.url).searchParams.get("supplier") ?? undefined;
    const [suppliers, purchases, payments, arrivals] = await Promise.all([
      listSuppliers(),
      listPurchases(id),
      listPayments(id),
      listArrivals(id),
    ]);
    return NextResponse.json({ suppliers, purchases, payments, arrivals });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const garde = await admin();
  if ("error" in garde) {
    return NextResponse.json({ error: garde.error }, { status: garde.status });
  }
  try {
    const body = await request.json();
    const id = garde.profile.id;

    if (body.kind === "purchase") {
      if (!body.supplierId || !body.productId) {
        return NextResponse.json(
          { error: "Fournisseur et produit sont requis." },
          { status: 400 }
        );
      }
      if (!(Number(body.quantity) > 0)) {
        return NextResponse.json(
          { error: "La quantite doit etre superieure a zero." },
          { status: 400 }
        );
      }
      await createPurchase(body, id);
      return NextResponse.json({ ok: true });
    }

    if (body.kind === "arrival") {
      const lignes = Array.isArray(body.lines) ? body.lines : [];
      if (!body.supplierId || !body.arrivedAt) {
        return NextResponse.json(
          { error: "Fournisseur et date sont requis." },
          { status: 400 }
        );
      }
      // Un arrivage sans ligne n'apprend rien : il encombrerait la
      // liste et fausserait le compte des arrivages.
      const propres = lignes.filter(
        (l: { productId?: string; quantity?: number }) =>
          l.productId && Number(l.quantity) > 0
      );
      if (propres.length === 0) {
        return NextResponse.json(
          { error: "Cochez au moins un produit et indiquez sa quantite." },
          { status: 400 }
        );
      }
      await createArrival({ ...body, lines: propres }, id);
      return NextResponse.json({ ok: true });
    }

    if (body.kind === "payment") {
      if (!body.supplierId || !(Number(body.amount) > 0)) {
        return NextResponse.json(
          { error: "Fournisseur et montant sont requis." },
          { status: 400 }
        );
      }
      await createPayment(body, id);
      return NextResponse.json({ ok: true });
    }

    if (!String(body.name ?? "").trim()) {
      return NextResponse.json({ error: "Nom manquant." }, { status: 400 });
    }
    await createSupplier(body, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur inattendue.";
    // Le nom est unique : le dire en clair plutot que de montrer la
    // contrainte Postgres a quelqu'un qui saisit un fournisseur.
    const lisible = message.includes("suppliers_name_key")
      ? "Un fournisseur porte deja ce nom."
      : message;
    return NextResponse.json({ error: lisible }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const garde = await admin();
  if ("error" in garde) {
    return NextResponse.json({ error: garde.error }, { status: garde.status });
  }
  try {
    const { id, ...rest } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "Fournisseur manquant." }, { status: 400 });
    }
    await updateSupplier(id, rest);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}
