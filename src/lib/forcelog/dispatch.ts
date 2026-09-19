import { addParcel, getRecentParcelStatuses } from "./client";
import { mapOrderToParcel } from "./mapping";
import { ForceLogApiError } from "./types";
import type { Lead } from "@/components/dashboard/leads-data";
import { sendPushToAll } from "@/lib/push";
import { carrierCity, dispatchBlocker } from "./eligibility";
import { resolveParcelType, type ParcelChoice } from "./parcel-type";
import { deliverableCities } from "@/lib/supabase/cities";
import { parcelCatalogue } from "@/lib/supabase/products";

/** Statut a partir duquel une commande part automatiquement chez ForceLog. */
export const AUTO_DISPATCH_STATUS = "Confirme";

/**
 * Cette commande doit-elle partir chez le transporteur ?
 *
 * La question porte sur l'etat de la commande apres modification, et non
 * sur le champ qui vient d'etre touche. C'est la difference qui bloquait
 * le rattrapage : une commande refusee faute de ville exacte restait
 * confirmee et sans colis, et corriger la ville ne changeait pas le
 * statut, donc ne relancait rien. Il fallait repasser par un autre
 * statut puis revenir a "Confirme" pour que l'envoi reparte.
 *
 * Une commande confirmee sans numero de suivi est, par definition, une
 * commande qui aurait du partir. Toute modification est donc une
 * occasion de reessayer.
 */
export function shouldDispatch(lead: {
  status: string;
  trackingNumber?: string;
}): boolean {
  return lead.status === AUTO_DISPATCH_STATUS && !lead.trackingNumber;
}

/** Code ForceLog d'un colis remis au client. */
const DELIVERED_CODE = "DELIVERED";

/** Statuts dont un colis ne ressort plus. */
const FINAL_CODES = new Set(["DELIVERED", "RETURNED", "CANCELED", "REFUSE"]);

/**
 * Un colis clos et regle ne changera plus.
 *
 * Le statut ne suffit pas : un colis livre reste "Non Paye" tant que le
 * transporteur ne l'a pas facture, et cette facturation nous interesse.
 * C'est donc la conjonction des deux qui met un colis hors de la
 * surveillance — sans quoi un carnet de plusieurs milliers de colis
 * livres serait relu indefiniment.
 */
function isSettled(lead: Lead): boolean {
  if (!FINAL_CODES.has(lead.deliveryStatusCode ?? "")) return false;

  const situation = (lead.paymentStatus ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  // "Non Paye" contient "paye" : chercher le mot seul classerait un
  // impaye comme regle, et la commande sortirait de la surveillance
  // juste avant le moment qui nous interesse.
  if (situation.startsWith("non")) return false;
  return situation.includes("factur") || situation.includes("paye");
}

/**
 * Horodatage "AAAA-MM-JJ HH:MM" a l'heure du Maroc, meme format que les
 * dates renvoyees par ForceLog. Le fuseau est fixe explicitement : le
 * serveur d'hebergement tourne en UTC et afficherait une heure de moins.
 */
export function deliveryTimestamp(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Casablanca",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

/**
 * Envoie une commande chez ForceLog et renvoie les champs de suivi a
 * enregistrer. N'echoue jamais : une erreur ForceLog est retournee dans
 * `trackingError` pour etre affichee dans la colonne Code suivi, afin
 * qu'un probleme transporteur ne bloque pas le changement de statut.
 */
export async function dispatchToForceLog(
  lead: Pick<
    Lead,
    | "reference"
    | "client"
    | "phone"
    | "ville"
    | "adresse"
    | "amount"
    | "productName"
    | "parcelType"
    | "stockItems"
    | "itemCount"
    | "customerNote"
  >
): Promise<Partial<Lead>> {
  const apiKey = process.env.FORCELOG_API_KEY;
  if (!apiKey) {
    return { trackingError: "Cle API ForceLog non configuree." };
  }

  // Controle avant appel : un colis cree avec une ville fantaisiste ne
  // peut plus etre supprime une fois qu'il a quitte l'etat NEW_PARCEL.
  let city = "";
  try {
    const cities = await deliverableCities();
    const blocker = dispatchBlocker(lead, cities);
    if (blocker) return { trackingNumber: undefined, trackingError: blocker };
    city = carrierCity(lead.ville, cities);
  } catch {
    return { trackingError: "Liste des villes indisponible." };
  }

  // Le type de colis se decide ici, sur l'etat actuel du catalogue, et
  // non sur ce qui avait ete fige a l'arrivee de la commande.
  let choice: ParcelChoice = {
    parcelType: lead.parcelType ?? "simple",
    stockItems: lead.stockItems,
  };
  try {
    choice = resolveParcelType(lead, await parcelCatalogue());
  } catch {
    // Catalogue illisible : on part avec ce que porte la commande
    // plutot que de bloquer une expedition.
  }

  try {
    const parcel = await addParcel(apiKey, mapOrderToParcel({ ...lead, ...choice, carrierCity: city }));
    return {
      trackingNumber: parcel.TRACKING_NUMBER,
      // Le colis existe : le refus precedent n'a plus lieu d'etre.
      trackingError: null,
      // La commande retient ce qui est reellement parti.
      parcelType: choice.parcelType,
      stockItems: choice.stockItems,
      deliveryStatus: parcel.STATUS ?? "Nouveau colis",
      deliveryStatusCode: parcel.STATUS_CODE ?? "NEW_PARCEL",
      paymentStatus: parcel.SITUATION ?? "Non Paye",
    };
  } catch (error) {
    return {
      trackingError:
        error instanceof ForceLogApiError
          ? error.message
          : "Erreur inattendue lors de la creation du colis.",
    };
  }
}

/**
 * Recupere les statuts ForceLog des colis recents et renvoie, pour chaque
 * commande suivie, les changements a enregistrer.
 *
 * Regle importante : seuls le statut de livraison, le statut de paiement
 * et la date de livraison sont mis a jour. Le statut de confirmation
 * (`status`) reste la
 * propriete de l'equipe de confirmation et ne doit JAMAIS etre deduit de
 * l'etat du transporteur — un colis refuse a la livraison reste une
 * commande qui avait bien ete confirmee. Un test verrouille cette regle.
 *
 * Rappel de la contrainte API : ForceLog ignore ses propres filtres et ne
 * renvoie que les 20 colis les plus recents, donc seules les commandes
 * presentes dans ce lot peuvent etre rafraichies.
 */
export async function collectStatusUpdates(
  leads: Lead[]
): Promise<{ updates: Map<string, Partial<Lead>>; checked: number; error?: string }> {
  // On n'interroge que ce qui peut encore bouger : un colis livre et
  // facture est une ligne close, la redemander a chaque passage coute
  // sans rien apprendre.
  const tracked = leads.filter((l) => l.trackingNumber && !isSettled(l));
  if (tracked.length === 0) return { updates: new Map(), checked: 0 };

  const apiKey = process.env.FORCELOG_API_KEY;
  if (!apiKey) {
    return { updates: new Map(), checked: 0, error: "Cle API ForceLog non configuree." };
  }

  let statuses: Awaited<ReturnType<typeof getRecentParcelStatuses>>;
  try {
    statuses = await getRecentParcelStatuses(
      apiKey,
      tracked.map((l) => l.trackingNumber!)
    );
  } catch (error) {
    return {
      updates: new Map(),
      checked: 0,
      error:
        error instanceof ForceLogApiError
          ? error.message
          : "Erreur inattendue lors de la synchronisation.",
    };
  }

  const updates = new Map<string, Partial<Lead>>();
  const delivered: Lead[] = [];
  for (const lead of tracked) {
    const remote = statuses.get(lead.trackingNumber!);
    if (!remote) continue;

    // La date de livraison est posee la premiere fois que le colis est vu
    // livre, et ne bouge plus ensuite : c'est l'horodatage du passage a
    // "Livre", ForceLog ne communiquant aucune date de livraison.
    const stampsDelivery =
      remote.statusCode === DELIVERED_CODE && !lead.deliveryDate;

    // N'ecrit que si quelque chose a reellement change.
    if (
      !stampsDelivery &&
      remote.status === lead.deliveryStatus &&
      remote.statusCode === lead.deliveryStatusCode &&
      remote.situation === lead.paymentStatus
    ) {
      continue;
    }

    updates.set(lead.id, {
      deliveryStatus: remote.status,
      deliveryStatusCode: remote.statusCode,
      paymentStatus: remote.situation,
      ...(stampsDelivery ? { deliveryDate: deliveryTimestamp() } : {}),
    });

    // Une livraison merite une alerte, pas les autres changements de
    // statut : c'est elle qui appelle un encaissement.
    if (stampsDelivery) delivered.push(lead);
  }

  for (const lead of delivered) {
    await sendPushToAll({
      title: "Commande livree",
      body: `${lead.client} - ${lead.amount} encaisse`,
      tag: `livree-${lead.reference}`,
      kind: "payment",
    });
  }

  return { updates, checked: tracked.length };
}
