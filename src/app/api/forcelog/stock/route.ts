import { NextResponse } from "next/server";
import { getStock } from "@/lib/forcelog/client";
import { listProducts } from "@/lib/supabase/products";
import { ForceLogApiError } from "@/lib/forcelog/types";

/** Produits disponibles dans le depot ForceLog, pour les colis de stock. */
export async function GET() {
  const apiKey = process.env.FORCELOG_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Cle API ForceLog non configuree." },
      { status: 500 }
    );
  }

  try {
    const stock = await getStock(apiKey);

    /*
     * Le prix de vente, pris dans notre catalogue.
     *
     * Le transporteur ne le connait pas : il garde de la marchandise,
     * pas des tarifs. Sans lui, l'ecran de creation demanderait de
     * retaper un montant que l'application connait deja, et une faute
     * de frappe s'y glisserait tot ou tard.
     */
    const catalogue = await listProducts().catch(() => []);
    const prixParRef = new Map<string, number>();
    for (const p of catalogue) {
      if (!p.priceSale) continue;
      if (p.forcelogRef) prixParRef.set(p.forcelogRef, p.priceSale);
      if (p.ref) prixParRef.set(p.ref, p.priceSale);
    }

    // Aplati en une liste de variantes directement affichable, en
    // ecartant celles qui ne sont plus disponibles.
    const items = Object.values(stock).flatMap((product) =>
      (product.variants ?? [])
        .filter((variant) => variant.quantity > 0)
        .map((variant) => ({
          ref: variant.ref,
          name: variant.name || product.product_name,
          productName: product.product_name,
          barcode: variant.barcode ?? null,
          quantity: variant.quantity,
          image: product.image ?? null,
          price: prixParRef.get(variant.ref) ?? null,
        }))
    );

    return NextResponse.json({ items });
  } catch (error) {
    const message =
      error instanceof ForceLogApiError
        ? error.message
        : "Erreur inattendue lors de la recuperation du stock.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
