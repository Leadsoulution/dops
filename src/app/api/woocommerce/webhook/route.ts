import { NextResponse } from "next/server";
import { importWooOrders } from "@/lib/woocommerce/import";

/**
 * Notification de la boutique a chaque nouvelle commande.
 *
 * WooCommerce envoie la commande entiere, mais on ne s'en sert pas : on
 * relit les commandes recentes par l'API. Un webhook peut arriver deux
 * fois, dans le desordre, ou etre fabrique par n'importe qui ; relire la
 * source evite de creer une commande sur la foi d'un corps de requete.
 * L'unicite de `woo_order_id` empeche le doublon.
 */
export async function POST() {
  try {
    const result = await importWooOrders();
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    // 200 volontaire : un echec de notre cote ne doit pas pousser
    // WooCommerce a desactiver le webhook apres quelques essais.
    return NextResponse.json({
      received: true,
      error: error instanceof Error ? error.message : "Erreur inattendue.",
    });
  }
}

export async function GET() {
  return NextResponse.json({
    message:
      "Endpoint webhook WooCommerce. Configurez cette URL dans WooCommerce > Reglages > Avance > Webhooks, sujet 'Commande creee' (POST).",
  });
}
