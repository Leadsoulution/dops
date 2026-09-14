import { NextResponse } from "next/server";
import { importWooOrders } from "@/lib/woocommerce/import";
import { isWooConfigured, WooCommerceError } from "@/lib/woocommerce/client";

/** Reprend les commandes recentes de la boutique. */
export async function POST() {
  if (!(await isWooConfigured())) {
    return NextResponse.json(
      { error: "Aucune boutique WooCommerce connectee." },
      { status: 400 }
    );
  }
  try {
    return NextResponse.json(await importWooOrders());
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof WooCommerceError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Erreur inattendue.",
      },
      { status: 502 }
    );
  }
}
