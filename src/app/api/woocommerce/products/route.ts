import { NextResponse } from "next/server";
import {
  getWooStores,
  listAllProducts,
  WooCommerceError,
} from "@/lib/woocommerce/client";
import { linkWooProducts } from "@/lib/supabase/products";

/**
 * Rapproche le catalogue de la boutique.
 *
 * Chaque produit WooCommerce ayant un SKU est rattache au produit
 * correspondant du catalogue, ou ajoute s'il n'y figure pas encore. Le
 * lien vers le code article ForceLog reste a faire a la main : lui seul
 * sait quel article du depot correspond, et le deviner enverrait un jour
 * le mauvais colis.
 */
export async function POST() {
  try {
    /*
     * Les catalogues de toutes les boutiques, mis bout a bout.
     *
     * Un SKU porte par deux boutiques designe le meme article du
     * depot : c'est le meme produit vendu deux fois. Le rapprochement
     * le reconnaitra a son SKU, comme avant.
     */
    const stores = await getWooStores();
    const products = (
      await Promise.all(stores.map((s) => listAllProducts(s)))
    ).flat();
    const withSku = products.filter((p) => p.sku?.trim());
    const result = await linkWooProducts(
      withSku.map((p) => ({
        sku: p.sku.trim(),
        name: p.name,
        price: Number(p.price) || 0,
        quantity: p.stock_quantity ?? 0,
        image: p.images?.[0]?.src,
      }))
    );

    return NextResponse.json({
      ...result,
      total: products.length,
      sansSku: products.length - withSku.length,
    });
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
