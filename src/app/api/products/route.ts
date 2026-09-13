import { NextResponse } from "next/server";
import { createProduct, listProducts } from "@/lib/supabase/products";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";

function notConfigured() {
  return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
}

export async function GET() {
  if (!isSupabaseServerConfigured) return notConfigured();
  try {
    return NextResponse.json({ products: await listProducts() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}

/**
 * Cree un produit au catalogue.
 *
 * L'import du stock ForceLog vit desormais sur sa propre route, pour que
 * le catalogue reste ce qui a ete saisi ici et ne soit jamais remplace
 * par l'inventaire du transporteur sans qu'on l'ait demande.
 */
export async function POST(request: Request) {
  if (!isSupabaseServerConfigured) return notConfigured();
  try {
    const body = await request.json();
    return NextResponse.json({ product: await createProduct(body) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 400 }
    );
  }
}
