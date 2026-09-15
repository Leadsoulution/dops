import { cityKey } from "@/lib/supabase/cities";

/**
 * Ce qu'une commande doit avoir avant de partir chez le transporteur.
 *
 * ForceLog accepte a peu pres tout : une ville inventee cree un colis
 * qu'aucun livreur ne saura router, et le colis ne peut plus etre
 * supprime une fois sorti de l'etat NEW_PARCEL. Mieux vaut donc refuser
 * en amont et le dire clairement, plutot que de creer un colis perdu.
 *
 * Le message revient a l'ecran dans la colonne Code suivi, en rouge, la
 * ou se lit deja toute erreur transporteur.
 */

export type DispatchCandidate = {
  client?: string;
  phone?: string;
  ville?: string;
};

/**
 * Un numero utilisable : au moins neuf chiffres une fois les espaces et
 * indicatifs retires. Volontairement large — refuser un numero valide
 * couterait une vente, et le livreur reste seul juge d'un numero
 * joignable.
 */
function hasUsablePhone(phone: string | undefined): boolean {
  return (phone ?? "").replace(/\D/g, "").length >= 9;
}

/**
 * Renvoie ce qui empeche l'envoi, ou `null` si la commande peut partir.
 * Fonction pure : la liste des villes livrables est fournie par l'appelant.
 */
export function dispatchBlocker(
  order: DispatchCandidate,
  deliverableCities: Set<string>
): string | null {
  if (!order.client?.trim()) {
    return "Saisir le nom du client";
  }
  if (!hasUsablePhone(order.phone)) {
    return "Numero de telephone indisponible";
  }

  const ville = order.ville?.trim();
  if (!ville) {
    return "Saisir la ville exacte";
  }
  if (!deliverableCities.has(cityKey(ville))) {
    // La ville ecrite est citee : sans elle, on ne sait pas quoi corriger.
    return `Ville inconnue "${ville}" : saisir la ville exacte`;
  }

  return null;
}
