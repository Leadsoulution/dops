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
    const message =
      error instanceof Error ? error.message : "Erreur inattendue.";
    /*
     * L'echec part dans les journaux du serveur.
     *
     * La reponse reste 200 — un echec de notre cote ne doit pas pousser
     * WooCommerce a desactiver le webhook — mais elle ne va nulle part :
     * personne ne lit le corps d'une notification. Un import qui tombe
     * ne laissait donc aucune trace, et la boutique a vendu cinq heures
     * sans que rien n'arrive dans l'application avant qu'on s'en
     * apercoive.
     */
    console.error("[woocommerce] import echoue :", message);
    return NextResponse.json({ received: true, error: message });
  }
}

export async function GET() {
  return NextResponse.json({
    message:
      "Endpoint webhook WooCommerce. Configurez cette URL dans WooCommerce > Reglages > Avance > Webhooks, sujet 'Commande creee' (POST).",
  });
}
