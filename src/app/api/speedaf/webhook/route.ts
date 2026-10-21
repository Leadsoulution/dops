import { NextRequest, NextResponse } from "next/server";
import { findLeadByTrackingNumber, updateLead } from "@/lib/supabase/leads";
import { recordLeadChanges } from "@/lib/supabase/lead-events";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";
import { verifyWebhook } from "@/lib/speedaf/client";
import { latestStatus } from "@/lib/speedaf/status";
import { delivererFrom } from "@/lib/speedaf/sync";

/**
 * Les changements de statut pousses par Speedaf.
 *
 * Contrairement a ForceLog, tout est documente : le corps est signe en
 * HMAC-SHA256, chaque evenement porte un identifiant pour le cas ou il
 * arriverait deux fois, et Speedaf rejoue tant qu'on ne repond pas
 * exactement `{"success": true}` avec un code 2xx.
 *
 * La signature porte sur le corps **brut**. On le lit donc en texte,
 * jamais avec `request.json()` : reformater le JSON avant de verifier
 * donnerait une autre empreinte, et toutes les notifications seraient
 * rejetees.
 *
 * Repondre en erreur HTTP ferait rejouer l'evenement indefiniment. On
 * repond donc toujours 200, en disant dans le corps si on a pu le
 * traiter.
 */

type Charge = {
  eventId?: string;
  mailNo?: string;
  tracks?: {
    action?: string;
    subAction?: string;
    msgEng?: string;
    message?: string;
    time?: string;
  }[];
};

const recu = (success: boolean, error?: string) =>
  NextResponse.json({ success, error: error ?? null, data: null });

export async function POST(request: NextRequest) {
  if (!isSupabaseServerConfigured) return recu(false, "Supabase non configure.");

  const brut = await request.text();

  const secret = process.env.SPEEDAF_SECRET_KEY;
  if (secret) {
    const signature = request.headers.get("x-speedaf-signature") ?? "";
    const horodatage = request.headers.get("x-speedaf-timestamp") ?? "";
    if (!verifyWebhook(secret, horodatage, brut, signature)) {
      console.error("[speedaf] notification refusee : signature invalide");
      return recu(false, "Signature invalide.");
    }
  }

  let charge: Charge;
  try {
    charge = JSON.parse(brut);
  } catch {
    return recu(false, "JSON invalide.");
  }

  const code = charge.mailNo?.trim();
  if (!code) return recu(false, "Numero de colis absent.");

  try {
    const lead = await findLeadByTrackingNumber(code);
    // Un colis inconnu n'est pas une erreur de leur cote : on accuse
    // reception, sinon Speedaf rejouerait l'evenement sans fin.
    if (!lead) return recu(true);

    const tracks = charge.tracks ?? [];
    const etat = latestStatus(tracks);
    const changes: Record<string, string> = {};

    if (etat.code !== lead.deliveryStatusCode) {
      changes.deliveryStatus = etat.label;
      changes.deliveryStatusCode = etat.code;
    }
    if (etat.code === "DELIVERED" && !lead.deliveryDate) {
      const remise = tracks.filter((t) => t.action === "5").at(-1);
      const t = (remise?.time ?? tracks.at(-1)?.time ?? "").trim();
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(t)) {
        changes.deliveryDate = t.slice(0, 16);
      }
    }
    const livreur = delivererFrom(tracks);
    if (livreur && livreur.name !== lead.deliverer) {
      changes.deliverer = livreur.name;
      if (livreur.phone) changes.delivererPhone = livreur.phone;
    }

    // Rien de neuf : la meme notification a deja ete traitee. C'est le
    // cas courant, Speedaf rejouant volontiers.
    if (Object.keys(changes).length === 0) return recu(true);

    const apres = await updateLead(lead.id, changes);
    await recordLeadChanges(lead, apres, { name: "Speedaf" });
    return recu(true);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inattendue.";
    console.error("[speedaf] notification non traitee :", message);
    return recu(false, message);
  }
}

export function GET() {
  return NextResponse.json({
    message:
      "Adresse de notification Speedaf. A declarer via leur API d'abonnement (track/webhook/subscribe).",
  });
}
