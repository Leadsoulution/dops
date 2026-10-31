import { NextResponse } from "next/server";
import {
  checkConnection,
  getWooStores,
  WooCommerceError,
} from "@/lib/woocommerce/client";

/**
 * L'etat de chaque boutique, une par une.
 *
 * Un seul "connecte" pour l'ensemble cacherait la boutique en panne
 * derriere celle qui marche — et c'est la premiere qu'on a besoin de
 * voir. `connected` reste rendu pour la pastille generale : il dit
 * qu'au moins une boutique repond.
 */
export async function GET() {
  const stores = await getWooStores();
  if (stores.length === 0) {
    return NextResponse.json({
      connected: false,
      stores: [],
      error: "WooCommerce non configure.",
    });
  }

  const etats = await Promise.all(
    stores.map(async (store) => {
      try {
        const info = await checkConnection(store);
        return { id: store.id, name: store.name, url: store.url, connected: true, ...info };
      } catch (error) {
        return {
          id: store.id,
          name: store.name,
          url: store.url,
          connected: false,
          error:
            error instanceof WooCommerceError
              ? error.message
              : "Erreur inattendue.",
        };
      }
    })
  );

  return NextResponse.json({
    connected: etats.some((e) => e.connected),
    stores: etats,
  });
}
