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

/**
 * Cinq minutes.
 *
 * C'etait deux, et chaque tour relit la liste des commandes en entier
 * — deux mille lignes, pour chaque onglet ouvert. Le projet a fini par
 * depasser son quota de trafic et par etre coupe.
 *
 * Rien n'est perdu a attendre trois minutes de plus : Speedaf pousse
 * desormais ses changements de statut des qu'ils arrivent, et c'est
 * lui qui porte tous les colis. Ce tour-ci ne sert plus qu'a rattraper
 * ce que la notification aurait manque, et a reperer les commandes
 * nouvelles de la boutique.
 */
const INTERVAL_MS = 300_000;

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

    function programme(delai: number) {
      clearTimeout(timer);
      timer = setTimeout(check, delai);
    }

    async function check() {
      /*
       * Onglet au second plan : on ne releve rien.
       *
       * Un onglet oublie derriere les autres, ou laisse ouvert toute
       * la nuit, relisait la base toutes les deux minutes pour
       * personne. C'est la principale depense inutile de
       * l'application, et elle ne manque a personne : ce qui compte
       * arrive par notification, et le premier releve se fait des que
       * l'onglet revient devant.
       */
      if (typeof document !== "undefined" && document.hidden) {
        if (!cancelled) programme(INTERVAL_MS);
        return;
      }
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
            { tag: `commande-${lead.reference}`, kind: "order" }
          );
        } else if (nouvelles.length > 1) {
          notify(
            `${nouvelles.length} nouvelles commandes`,
            nouvelles
              .slice(0, 3)
              .map((l) => l.client)
              .join(", "),
            { tag: "commandes", kind: "order" }
          );
        }

        for (const lead of livrees) {
          notify(
            "Commande livree",
            `${lead.client} — ${lead.amount} encaisse`,
            { tag: `livree-${lead.reference}`, kind: "payment" }
          );
        }
      } catch {
        /* Reseau coupe : on reessaiera au prochain tour. */
      } finally {
        if (!cancelled) programme(INTERVAL_MS);
      }
    }

    // Laisse la page s'afficher avant d'aller interroger la boutique et
    // le transporteur : ces deux appels durent plusieurs secondes et
    // retarderaient les commandes qu'on attend a l'ecran.
    programme(4000);

    // L'onglet revient devant : on reprend sans attendre le tour
    // suivant, sinon il afficherait jusqu'a cinq minutes de retard.
    const retour = () => {
      if (!document.hidden && !cancelled) programme(1500);
    };
    document.addEventListener("visibilitychange", retour);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("pointerdown", unlock);
      document.removeEventListener("visibilitychange", retour);
    };
  }, []);

  return null;
}
