import { NextResponse } from "next/server";
import { deleteProduct, updateProduct } from "@/lib/supabase/products";

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/products/[id]">
) {
  const { id } = await ctx.params;
  try {
    return NextResponse.json({
      product: await updateProduct(id, await request.json()),
    });
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
