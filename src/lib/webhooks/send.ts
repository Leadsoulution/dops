import "server-only";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildPayload,
  subscribes,
  retryDelayMinutes,
  type WebhookEvent,
} from "./payload";
import type { Lead } from "@/components/dashboard/leads-data";

/**
 * Envoi des webhooks vers n8n.
 *
 * Deux regles gouvernent ce module.
 *
 * La premiere : un webhook ne doit jamais empecher une commande d'etre
 * enregistree. Si n8n est en panne, l'agent doit pouvoir continuer a
 * confirmer. L'envoi est donc detache, et tout echec est range dans le
 * journal plutot que remonte a l'appelant.
 *
 * La seconde : un echec doit se voir. Un webhook muet laisse croire que
 * les messages partent alors que plus rien n'arrive au client — c'est
 * pire que pas de webhook du tout. Chaque tentative laisse une trace,
 * et les echecs sont repris plus tard.
 */

/** Au-dela, le message n'interesse plus personne. */
const MAX_ATTEMPTS = 6;

/** n8n repond vite ou ne repond pas : inutile d'attendre davantage. */
const TIMEOUT_MS = 10_000;

type WebhookRow = {
  id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
};

/** Un secret d'abonnement, assez long pour ne pas se deviner. */
export function newSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

/**
 * Signature d'un envoi.
 *
 * L'horodatage entre dans la signature : sans lui, un appel capte
 * pourrait etre rejoue indefiniment, et le client recevrait deux fois
 * le meme message.
 */
export function sign(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/**
 * Verifie une signature, en temps constant.
 *
 * Une comparaison ordinaire s'arrete au premier caractere different, et
 * sa duree renseigne sur le nombre de caracteres justes. Exporte pour
 * que le destinataire puisse s'en servir, et pour etre testee.
 */
export function verify(
  secret: string,
  timestamp: string,
  body: string,
  signature: string
): boolean {
  const attendu = Buffer.from(sign(secret, timestamp, body), "utf8");
  const recu = Buffer.from(signature, "utf8");
  return attendu.length === recu.length && timingSafeEqual(attendu, recu);
}

/**
 * Previent les abonnes qu'une commande a bouge.
 *
 * N'echoue jamais et n'est jamais attendu : l'appelant continue son
 * travail pendant que les envois partent.
 */
export async function emit(
  event: WebhookEvent,
  lead: Lead,
  previous?: { status?: string; deliveryStatus?: string }
): Promise<void> {
  try {
    const supabase = getSupabaseServerClient();
    const { data } = await supabase
      .from("webhooks")
      .select("id,url,secret,events,active")
      .eq("active", true);

    const abonnes = ((data ?? []) as WebhookRow[]).filter((w) =>
      subscribes(w.events ?? [], event)
    );
    if (abonnes.length === 0) return;

    const payload = buildPayload(event, lead, previous);

    /*
     * L'evenement est d'abord ecrit, ensuite envoye.
     *
     * L'ecriture est rapide et attendue ; l'envoi est lent et ne l'est
     * pas. Dans l'autre ordre, un processus qui s'arrete entre les deux
     * — un deploiement, une coupure — perdrait l'evenement sans que
     * rien ne le signale. Pose en attente, il sera repris au prochain
     * passage meme si cette tentative-ci n'aboutit jamais.
     */
    const { data: posees } = await supabase
      .from("webhook_deliveries")
      .insert(
        abonnes.map((w) => ({
          webhook_id: w.id,
          event,
          payload,
          status: "en_attente",
          attempts: 0,
          next_retry_at: new Date().toISOString(),
        }))
      )
      .select("id,webhook_id");

    const lignes = (posees ?? []) as { id: string; webhook_id: string }[];
    const parHook = new Map(lignes.map((l) => [l.webhook_id, l.id]));

    // La tentative immediate n'est pas attendue : l'agent n'a pas a
    // patienter qu'un service tiers reponde pour changer un statut.
    for (const w of abonnes) {
      void deliver(w, event, payload, 1, parHook.get(w.id));
    }
  } catch {
    // Journal inaccessible ou base muette : une commande ne doit pas
    // tomber parce qu'un webhook n'a pas pu partir.
  }
}

/** Un envoi, et sa trace. */
async function deliver(
  webhook: WebhookRow,
  event: WebhookEvent,
  payload: unknown,
  attempt = 1,
  deliveryId?: string
): Promise<void> {
  const supabase = getSupabaseServerClient();
  const body = JSON.stringify(payload);
  const timestamp = String(Date.now());

  let httpStatus: number | null = null;
  let error: string | null = null;

  try {
    const res = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Dops-Event": event,
        "X-Dops-Timestamp": timestamp,
        "X-Dops-Signature": sign(webhook.secret, timestamp, body),
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    httpStatus = res.status;
    if (!res.ok) error = `Le destinataire a repondu ${res.status}.`;
  } catch (e) {
    error = e instanceof Error ? e.message : "Envoi impossible.";
  }

  const succes = !error;
  const ligne = {
    webhook_id: webhook.id,
    event,
    payload,
    status: succes ? "succes" : attempt >= MAX_ATTEMPTS ? "echec" : "en_attente",
    http_status: httpStatus,
    error,
    attempts: attempt,
    next_retry_at:
      succes || attempt >= MAX_ATTEMPTS
        ? null
        : new Date(Date.now() + retryDelayMinutes(attempt) * 60_000).toISOString(),
    delivered_at: succes ? new Date().toISOString() : null,
  };

  if (deliveryId) {
    await supabase.from("webhook_deliveries").update(ligne).eq("id", deliveryId);
  } else {
    // Sans ligne prealable — une reprise dont la trace aurait disparu —
    // on en cree une plutot que de perdre le resultat.
    await supabase.from("webhook_deliveries").insert(ligne);
  }

  // L'etat de l'abonnement, pour que la page de reglage puisse dire
  // "ca marche" ou "ca ne marche plus depuis trois jours".
  await supabase
    .from("webhooks")
    .update(
      succes
        ? { last_success_at: new Date().toISOString(), last_error: null, failure_count: 0 }
        : { last_error: error }
    )
    .eq("id", webhook.id);
}

/**
 * Reprend les envois en attente dont l'heure est venue.
 *
 * Appele par la synchronisation periodique : sans cette reprise, une
 * coupure de n8n de deux minutes perdrait definitivement les messages
 * de ces deux minutes.
 */
export async function retryPending(limit = 20): Promise<{ repris: number }> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("webhook_deliveries")
    .select("id,webhook_id,event,payload,attempts")
    .eq("status", "en_attente")
    .lte("next_retry_at", new Date().toISOString())
    .limit(limit);

  const attente = (data ?? []) as {
    id: string; webhook_id: string; event: string; payload: unknown; attempts: number;
  }[];
  if (attente.length === 0) return { repris: 0 };

  const { data: hooks } = await supabase
    .from("webhooks")
    .select("id,url,secret,events,active")
    .eq("active", true);
  const parId = new Map(((hooks ?? []) as WebhookRow[]).map((w) => [w.id, w]));

  let repris = 0;
  for (const d of attente) {
    const hook = parId.get(d.webhook_id);
    // L'abonnement a ete desactive depuis : inutile d'insister.
    if (!hook) continue;
    await deliver(hook, d.event as WebhookEvent, d.payload, d.attempts + 1, d.id);
    repris += 1;
  }
  return { repris };
}
