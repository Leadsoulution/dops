import "server-only";
import type { Lead } from "@/components/dashboard/leads-data";
import { trackParcels, type SpeedafTrack } from "./client";
import { getSpeedafSettings } from "@/lib/supabase/speedaf-settings";
import { enOrdre, latestStatus } from "./status";
import { sendDeliveredPush } from "@/lib/push";

/**
 * Rafraichir les colis confies a Speedaf.
 *
 * Leur suivi se demande par lot : cinquante colis en un appel, la ou
 * ForceLog oblige a les interroger un par un. On peut donc relire tout
 * ce qui est en cours a chaque passage, sans rattrapage ni file
 * d'attente.
 *
 * Seuls les colis encore en mouvement sont interroges : un colis livre
 * ou retourne ne changera plus, et le redemander chaque minute
 * reviendrait a payer pour apprendre ce qu'on sait deja.
 */

/** Statuts dont un colis ne ressort plus. */
const CLOS = new Set(["DELIVERED", "RETURNED", "CANCELED"]);

/**
 * Le livreur, tel que Speedaf le nomme dans ses messages.
 *
 * Ils ne l'exposent pas comme un champ : il est ecrit dans la phrase,
 * entre crochets japonais — "The delivery courier is 【WEISS2】". C'est
 * fragile, mais c'est la seule facon de savoir qui porte le colis, et
 * l'equipe en a besoin pour appeler.
 */
export function delivererFrom(
  tracks: { action?: string | null; msgEng?: string; message?: string; time?: string }[]
): { name: string; phone?: string } | undefined {
  const liste = enOrdre(tracks);
  for (let i = liste.length - 1; i >= 0; i -= 1) {
    const t = liste[i];
    if (t.action !== "4" && t.action !== "5") continue;
    const entre = [...(t.msgEng ?? t.message ?? "").matchAll(/【([^】]+)】/g)].map(
      (m) => m[1].trim()
    );
    // Leur phrase melange le site, le livreur et parfois son numero :
    // "Pick-Up Courier is 【Ejalonibu Wahab】【09025119825】". Le numero
    // se reconnait a ses chiffres, le nom est le dernier qui n'en est
    // pas un.
    const estNumero = (v: string) => /^[\d\s+()-]{6,}$/.test(v);
    const name = entre.filter((v) => !estNumero(v)).at(-1);
    if (!name) continue;
    const phone = entre.filter(estNumero).at(-1);
    return phone ? { name, phone } : { name };
  }
  return undefined;
}

/** "2026-10-21 14:30:02" devient "2026-10-21 14:30", comme ailleurs. */
function horodatage(time: string | undefined): string | undefined {
  const t = (time ?? "").trim();
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(t) ? t.slice(0, 16) : undefined;
}

export async function collectSpeedafUpdates(leads: Lead[]): Promise<{
  updates: Map<string, Partial<Lead>>;
  checked: number;
  error?: string;
}> {
  const updates = new Map<string, Partial<Lead>>();
  const livrees: Lead[] = [];
  const config = await getSpeedafSettings();
  if (!config) return { updates, checked: 0 };

  const suivis = leads.filter(
    (l) =>
      l.carrier === "speedaf" &&
      l.trackingNumber &&
      !CLOS.has(l.deliveryStatusCode ?? "")
  );
  if (suivis.length === 0) return { updates, checked: 0 };

  let parColis: Map<string, SpeedafTrack[]>;
  try {
    parColis = await trackParcels(
      config,
      suivis.map((l) => l.trackingNumber as string)
    );
  } catch (error) {
    return {
      updates,
      checked: 0,
      error: error instanceof Error ? error.message : "Suivi Speedaf indisponible.",
    };
  }

  for (const lead of suivis) {
    const bruts = parColis.get(lead.trackingNumber as string);
    if (!bruts || bruts.length === 0) continue;
    // Remis dans l'ordre une fois pour toutes : la date de remise et
    // le livreur se lisent eux aussi par la fin de la liste.
    const tracks = enOrdre(bruts);

    const etat = latestStatus(tracks);
    const changes: Partial<Lead> = {};

    if (etat.code !== lead.deliveryStatusCode) {
      changes.deliveryStatus = etat.label;
      changes.deliveryStatusCode = etat.code;
    }
    if (etat.code === "DELIVERED" && !lead.deliveryDate) {
      const remise = tracks.filter((t) => t.action === "5").at(-1);
      changes.deliveryDate = horodatage(remise?.time) ?? horodatage(tracks.at(-1)?.time);
    }
    // Une remise merite une alerte, pas les autres changements de
    // statut : c'est elle qui appelle un encaissement. Le colis doit
    // changer d'etat a ce passage-ci, sinon chaque tour de
    // synchronisation reannoncerait la meme livraison.
    if (etat.code === "DELIVERED" && lead.deliveryStatusCode !== "DELIVERED") {
      livrees.push(lead);
    }
    const livreur = delivererFrom(tracks);
    if (livreur && livreur.name !== lead.deliverer) {
      changes.deliverer = livreur.name;
      if (livreur.phone) changes.delivererPhone = livreur.phone;
    }

    if (Object.keys(changes).length > 0) updates.set(lead.id, changes);
  }

  for (const lead of livrees) await sendDeliveredPush(lead);

  return { updates, checked: suivis.length };
}
