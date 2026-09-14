import { NextResponse } from "next/server";
import {
  deleteProduct,
  findByForcelogRef,
  updateProduct,
} from "@/lib/supabase/products";

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/products/[id]">
) {
  const { id } = await ctx.params;
  try {
    const changes = await request.json();

    // Le catalogue se remplit par deux bouts : un meme objet physique
    // peut y avoir une fiche transporteur et une fiche boutique. Plutot
    // qu'une violation de contrainte illisible, on nomme l'autre fiche
    // et on propose de les fusionner.
    if (changes.forcelogRef) {
      const conflict = await findByForcelogRef(changes.forcelogRef, id);
      if (conflict) {
        return NextResponse.json(
          {
            error: `Le code article ${conflict.forcelogRef} appartient deja au produit "${conflict.name}".`,
            conflict: {
              id: conflict.id,
              name: conflict.name,
              forcelogRef: conflict.forcelogRef,
            },
          },
          { status: 409 }
        );
      }
    }

    return NextResponse.json({ product: await updateProduct(id, changes) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/products/[id]">
) {
  const { id } = await ctx.params;
  try {
    await deleteProduct(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}
