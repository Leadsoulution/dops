import { whatsappNumber } from "@/lib/whatsapp";
import { amountValue, roundToTen } from "@/lib/amount";
import type { Lead } from "@/components/dashboard/leads-data";

/**
 * Ce qu'un webhook transporte.
 *
 * Module sans dependance serveur : il est ainsi testable seul, et la
 * forme du message reste verifiable sans base ni reseau.
 *
 * Le contenu est pense pour n8n : tout ce qu'il faut pour ecrire au
 * client s'y trouve deja, sous la forme ou il s'utilise. Le telephone
 * est donne deux fois — tel qu'il est saisi, et au format
 * international que WhatsApp exige — pour eviter une transformation de
 * plus dans un outil qui n'a pas de fonction pour cela.
 */

export const WEBHOOK_EVENTS = [
  "lead.created",
  "lead.status_changed",
  "lead.delivery_status_changed",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export type WebhookPayload = {
  event: WebhookEvent;
  sent_at: string;
  order: {
    reference: string;
    client: string;
    phone: string;
    /** Chiffres seuls, indicatif compris : la forme attendue par WhatsApp. */
    phone_international: string;
    ville: string | null;
    quartier: string | null;
    adresse: string | null;
    product_name: string;
    product_image: string | null;
    item_count: number;
    amount: string;
    /** Le montant arrondi, celui que le livreur reclamera vraiment. */
    amount_value: number;
    status: string;
    /** Statut precedent, absent a la creation. */
    status_previous: string | null;
    delivery_status: string | null;
    delivery_status_code: string | null;
    delivery_status_previous: string | null;
    tracking_number: string | null;
    delivery_date: string | null;
    customer_note: string | null;
    created_at: string | null;
  };
};

export function buildPayload(
  event: WebhookEvent,
  lead: Lead,
  previous?: { status?: string; deliveryStatus?: string },
  now: Date = new Date()
): WebhookPayload {
  return {
    event,
    sent_at: now.toISOString(),
    order: {
      reference: lead.reference,
      client: lead.client,
      phone: lead.phone,
      phone_international: whatsappNumber(lead.phone),
      ville: lead.ville ?? null,
      quartier: lead.quartier ?? null,
      adresse: lead.adresse ?? null,
      product_name: lead.productName,
      product_image: lead.productImage ?? null,
      item_count: lead.itemCount ?? 1,
      amount: lead.amount,
      amount_value: roundToTen(amountValue(lead.amount) ?? 0),
      status: lead.status,
      status_previous: previous?.status ?? null,
      delivery_status: lead.deliveryStatus ?? null,
      delivery_status_code: lead.deliveryStatusCode ?? null,
      delivery_status_previous: previous?.deliveryStatus ?? null,
      tracking_number: lead.trackingNumber ?? null,
      delivery_date: lead.deliveryDate ?? null,
      customer_note: lead.customerNote ?? null,
      created_at: lead.date || null,
    },
  };
}

/**
 * Cet abonnement veut-il de cet evenement ?
 *
 * Une liste vide vaut "tous" : c'est le reglage le plus courant, et
 * obliger a cocher les trois cases pour l'obtenir serait une corvee
 * sans raison.
 */
export function subscribes(events: string[], event: WebhookEvent): boolean {
  return events.length === 0 || events.includes(event);
}

/**
 * Delai avant le prochain essai, en minutes.
 *
 * Il double a chaque echec : un service qui redemarre a besoin d'un
 * instant, un service en panne n'a pas besoin qu'on le harcele. Plafonne
 * a une heure, au-dela le message ne vaudrait plus grand-chose pour le
 * client.
 */
export function retryDelayMinutes(attempts: number): number {
  return Math.min(60, 2 ** Math.max(0, attempts - 1));
}
