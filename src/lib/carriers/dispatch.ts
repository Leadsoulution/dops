import "server-only";
import type { Lead } from "@/components/dashboard/leads-data";
import { dispatchToForceLog } from "@/lib/forcelog/dispatch";
import { dispatchToSpeedaf } from "@/lib/speedaf/dispatch";
import { nextCarrierForProduct } from "@/lib/supabase/carriers";
import { carrierOfLead, type CarrierId } from "./registry";

/**
 * L'aiguillage : quel transporteur prend cette commande, et l'envoi
 * chez lui.
 *
 * Une commande dont le transporteur est deja inscrit part chez lui —
 * c'est un choix fait a la main, il ne se rediscute pas. Les autres
 * suivent la repartition reglee dans les integrations.
 *
 * Le transporteur retenu est rendu avec le reste : la commande garde
 * la trace de qui l'a prise, sans quoi la repartition suivante ne
 * saurait plus compter.
 */
export async function dispatchLead(
  lead: Pick<
    Lead,
    | "reference"
    | "client"
    | "phone"
    | "ville"
    | "quartier"
    | "adresse"
    | "amount"
    | "productName"
    | "parcelType"
    | "stockItems"
    | "itemCount"
    | "customerNote"
    | "carrier"
  >
): Promise<Partial<Lead>> {
  const choisi: CarrierId = lead.carrier
    ? carrierOfLead(lead.carrier)
    : await nextCarrierForProduct(lead).catch(() => "forcelog" as CarrierId);

  if (choisi === "speedaf") {
    const resultat = await dispatchToSpeedaf(lead);
    // Meme en cas d'echec, la commande retient a qui elle etait
    // destinee : sans cela, le prochain essai pourrait partir ailleurs
    // et personne ne comprendrait l'erreur affichee.
    return { carrier: "speedaf", ...resultat };
  }
  return { carrier: "forcelog", ...(await dispatchToForceLog(lead)) };
}
