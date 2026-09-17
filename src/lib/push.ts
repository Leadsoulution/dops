import "server-only";
import webpush from "web-push";
import { getSupabaseServerClient, isSupabaseServerConfigured } from "./supabase/server";

/**
 * Notifications push.
 *
 * Elles existent pour une seule raison : joindre un telephone dont
 * l'application est fermee. Tant qu'un onglet est ouvert, la
 * surveillance en place suffit et sonne toute seule.
 *
 * Le message est chiffre pour l'appareil destinataire ; ni Google ni
 * Apple ne peuvent le lire en transit. Les clefs VAPID nous identifient
 * aupres de leurs serveurs.
 */

export type PushPayload = {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  /** Distingue les deux evenements cote appareil. */
  kind?: "order" | "payment";
};

let configured = false;

function ensureConfigured(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:contact@orderly.host",
      publicKey,
      privateKey
    );
    configured = true;
  }
  return true;
}

export const isPushConfigured = () =>
  Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

export async function saveSubscription(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  profileId: string | null,
  userAgent?: string
): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      profile_id: profileId,
      user_agent: userAgent ?? null,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );
  if (error) throw new Error(error.message);
}

export async function removeSubscription(endpoint: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

/**
 * Envoie a tous les appareils enregistres.
 *
 * Un appareil qui repond 404 ou 410 a desinstalle l'application ou
 * revoque l'abonnement : on le retire, sinon la table grossirait
 * indefiniment d'adresses mortes.
 *
 * N'echoue jamais : une notification manquee ne doit pas faire echouer
 * l'import d'une commande.
 */
export type PushResult = {
  sent: number;
  /** Ce que le service push a repondu, quand il a refuse. */
  failures: { status?: number; message: string; removed: boolean }[];
};

export async function sendPushToAll(payload: PushPayload): Promise<PushResult> {
  if (!isSupabaseServerConfigured || !ensureConfigured()) {
    return { sent: 0, failures: [{ message: "Clefs push non configurees.", removed: false }] };
  }

  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth");

  const subscriptions = (data ?? []) as {
    endpoint: string;
    p256dh: string;
    auth: string;
  }[];
  if (subscriptions.length === 0) {
    return { sent: 0, failures: [{ message: "Aucun appareil abonne.", removed: false }] };
  }

  const body = JSON.stringify(payload);
  let sent = 0;
  const failures: PushResult["failures"] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
          { TTL: 3600 }
        );
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // 404 et 410 disent que l'abonnement n'existe plus chez le
        // service push : le garder ferait grossir la table d'adresses
        // mortes. Les autres codes decrivent un probleme de notre cote
        // — clef qui ne correspond pas, charge trop lourde — et
        // l'abonnement, lui, reste valable.
        const gone = status === 404 || status === 410;
        if (gone) await removeSubscription(sub.endpoint);
        failures.push({
          status,
          message:
            (error as { body?: string; message?: string }).body ??
            (error as Error).message ??
            "Envoi refuse.",
          removed: gone,
        });
      }
    })
  );

  return { sent, failures };
}
