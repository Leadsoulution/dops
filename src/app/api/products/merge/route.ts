import { NextResponse } from "next/server";
import { mergeIntoCarrierProduct } from "@/lib/supabase/products";

/**
 * Relie une fiche boutique a l'article du depot transporteur, en n'en
 * gardant qu'une. Voir `mergeIntoCarrierProduct` pour la regle.
 */
export async function POST(request: Request) {
  try {
    const { sourceId, forcelogRef } = await request.json();
    if (!sourceId || !forcelogRef) {
      return NextResponse.json(
        { error: "Produit et code article requis." },
        { status: 400 }
      );
    }
    return NextResponse.json({
      product: await mergeIntoCarrierProduct(sourceId, forcelogRef),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 400 }
    );
  }
}
