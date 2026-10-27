import "server-only";
import type { Lead } from "@/components/dashboard/leads-data";
import { carrierOfLead } from "@/lib/carriers/registry";
import { getSpeedafSettings } from "@/lib/supabase/speedaf-settings";
import { cancelOrder, SpeedafError } from "./client";

/**
 * Annuler un colis Speedaf, et refaire celui qu'une correction a rendu
 * faux.
 *
 * Speedaf ne sait pas modifier un colis : son API en cree, en annule,
 * en suit — rien de plus. Corriger une adresse demande donc d'annuler
 * le premier et d'en creer un second, et le numero de suivi change.
 * Ce n'est pas un detail quand le client a deja recu l'ancien.
 *
 * L'ordre compte : on annule avant de recreer. L'inverse laisserait
 * deux colis vivants pour une seule commande le jour ou l'annulation
 * echoue, et le livreur se presenterait deux fois.
 *
 * ForceLog n'entre pas dans ce mecanisme : son API n'offre qu'une
 * suppression dont nous ne connaissons ni la fenetre ni l'effet sur le
 * stock qu'il detient. Tant que ce n'est pas verifie chez lui, ses
 * colis ne bougent pas d'ici.
 */

/**
 * Ce qui, modifie, rend le bordereau faux.
 *
 * Le reste — statut d'appel, agent assigne, note interne — ne figure
 * pas sur le colis. Le refaire pour cela ferait perdre un numero de
 * suivi sans rien corriger.
 */
const CHAMPS_DU_COLIS = [
  "client",
  "phone",
  "ville",
  "quartier",
  "adresse",
  "amount",
  "productName",
  "itemCount",
  "stockItems",
  "customerNote",
] as const;

/** Statuts apres lesquels il n'y a plus rien a annuler. */
const FINIS = new Set(["DELIVERED", "RETURNED"]);

/** Cette correction oblige-t-elle a refaire le colis ? */
export function colisARefaire(avant: Lead, apres: Lead): boolean {
  // Rien n'est encore parti : l'envoi normal s'en chargera.
  if (!apres.trackingNumber) return false;
  if (carrierOfLead(apres.carrier) !== "speedaf") return false;
  return CHAMPS_DU_COLIS.some(
    (champ) => (avant[champ] ?? "") !== (apres[champ] ?? "")
  );
}

export type Annulation = { ok: true } | { ok: false; raison: string };

/**
 * Demande l'annulation a Speedaf.
 *
 * C'est lui qui tranche : un colis deja ramasse se refuse, et son
 * message est rendu tel quel plutot que traduit en "erreur". L'agent
 * qui lit "colis deja pris en charge" sait quoi faire ; devant une
 * erreur generique, il reessaie.
 */
export async function cancelSpeedafParcel(
  lead: Pick<
    Lead,
    "trackingNumber" | "carrier" | "deliveryStatusCode" | "parcelType"
  >,
  raison: string
): Promise<Annulation> {
  if (!lead.trackingNumber) {
    return { ok: false, raison: "Cette commande n'a pas de colis." };
  }
  if (carrierOfLead(lead.carrier) !== "speedaf") {
    return {
      ok: false,
      raison: "Seuls les colis Speedaf s'annulent depuis l'application.",
    };
  }
  if (FINIS.has(lead.deliveryStatusCode ?? "")) {
    return {
      ok: false,
      raison: "Colis deja livre ou retourne : il n'y a plus rien a annuler.",
    };
  }

  const config = await getSpeedafSettings();
  if (!config) {
    return { ok: false, raison: "Identifiants Speedaf non configures." };
  }

  try {
    await cancelOrder(config, lead.trackingNumber, raison);
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof SpeedafError
        ? error.message
        : "Speedaf n'a pas repondu a la demande d'annulation.";
    /*
     * Un colis de stock ne s'annule pas par l'API.
     *
     * Leur OMS n'expose que la creation et l'inventaire — verifie :
     * cinq chemins d'annulation repondent 404, et la voie express
     * refuse le colis d'un "Order not allow cancel!". L'agent lirait
     * cet anglais sans savoir quoi en faire ; on lui dit donc ou
     * aller, puisqu'il reste le portail.
     */
    return {
      ok: false,
      raison:
        lead.parcelType === "stock"
          ? `${message} — un colis de stock ne s'annule pas depuis l'application : faites-le dans le portail Speedaf.`
          : message,
    };
  }
}
