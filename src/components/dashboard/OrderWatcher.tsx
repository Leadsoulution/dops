"use client";

import { useEffect, useRef } from "react";
import type { Lead } from "./leads-data";
import { notify, unlockAudio } from "@/lib/notifications";

/**
 * Surveille les commandes et alerte sur deux evenements : une commande
 * qui arrive, une commande qui est livree.
 *
 * Le releve initial ne declenche rien. Sans cette precaution, ouvrir
 * l'application ferait sonner vingt notifications d'un coup pour des
 * commandes deja connues.
 *
 * Le composant vit dans l'en-tete, present sur toutes les pages : une
 * livraison doit s'entendre depuis la page Produits comme depuis la
 * liste des commandes.
 */

/** Deux minutes : assez pour prevenir vite, assez peu pour ne pas
 * harceler le transporteur et la boutique. */
const INTERVAL_MS = 120_000;

type Snapshot = { status: string; delivered: boolean };

export default function OrderWatcher() {
  const known = useRef<Map<string, Snapshot> | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    // Le navigateur interdit le son avant une interaction : on leve la
    // reserve au premier clic, quel qu'il soit.
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });

    async function check() {
      try {
        // Les deux sources d'evenements : la boutique apporte des
        // commandes, le transporteur fait avancer les livraisons.
        await Promise.allSettled([
          fetch("/api/woocommerce/orders", { method: "POST" }),
          fetch("/api/leads/sync", { method: "POST" }),
        ]);

        const res = await fetch("/api/leads");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const leads: Lead[] = data.leads ?? [];

        const snapshot = new Map<string, Snapshot>(
          leads.map((l) => [
            l.reference,
            { status: l.status, delivered: l.deliveryStatusCode === "DELIVERED" },
          ])
        );

        const previous = known.current;
        known.current = snapshot;
        // Premier passage : on retient l'etat sans rien annoncer.
        if (!previous) return;

        const nouvelles = leads.filter((l) => !previous.has(l.reference));
        const livrees = leads.filter(
          (l) =>
            l.deliveryStatusCode === "DELIVERED" &&
            previous.get(l.reference)?.delivered === false
        );

        if (nouvelles.length === 1) {
          const lead = nouvelles[0];
          notify(
            "Nouvelle commande",
            `${lead.client} — ${lead.amount}${lead.ville ? ` — ${lead.ville}` : ""}`,
            { tag: `commande-${lead.reference}`, sound: "order" }
          );
        } else if (nouvelles.length > 1) {
          notify(
            `${nouvelles.length} nouvelles commandes`,
            nouvelles
              .slice(0, 3)
              .map((l) => l.client)
              .join(", "),
            { tag: "commandes", sound: "order" }
          );
        }

        for (const lead of livrees) {
          notify(
            "Commande livree",
            `${lead.client} — ${lead.amount} encaisse`,
            { tag: `livree-${lead.reference}`, sound: "payment" }
          );
        }
      } catch {
        /* Reseau coupe : on reessaiera au prochain tour. */
      } finally {
        if (!cancelled) timer = setTimeout(check, INTERVAL_MS);
      }
    }

    check();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("pointerdown", unlock);
    };
  }, []);

  return null;
}
