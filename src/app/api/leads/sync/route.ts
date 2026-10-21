import { NextResponse } from "next/server";
import { listLeads, updateLead } from "@/lib/supabase/leads";
import { recordLeadChanges } from "@/lib/supabase/lead-events";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";
import { collectStatusUpdates, collectDeliverers } from "@/lib/forcelog/dispatch";
import { collectSpeedafUpdates } from "@/lib/speedaf/sync";
import { carrierOfLead } from "@/lib/carriers/registry";
import { retryPending } from "@/lib/webhooks/send";

/**
 * Rafraichit les statuts de livraison et de paiement depuis ForceLog.
 *
 * Appelee au chargement de la page Leads & Commandes et par l'action
 * "Synchroniser". Ne renvoie que les commandes reellement modifiees.
 */
export async function POST() {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }

  try {
    const leads = await listLeads();

    /*
     * Les deux transporteurs sont interroges de front.
     *
     * Ils n'ont rien en commun : ForceLog repond d'un colis a la fois
     * et se rattrape sur plusieurs passages, Speedaf rend cinquante
     * colis en un appel. Les lancer ensemble evite d'ajouter l'attente
     * de l'un a celle de l'autre.
     */
    const [forcelog, speedaf] = await Promise.all([
      collectStatusUpdates(leads.filter((l) => carrierOfLead(l.carrier) === "forcelog")),
      collectSpeedafUpdates(leads),
    ]);

    const { checked } = forcelog;
    // Un transporteur en panne ne doit pas empecher l'autre de
    // repondre : l'erreur n'est rendue que si rien n'a abouti.
    const error = forcelog.error && speedaf.error ? forcelog.error : undefined;
    if (error) {
      return NextResponse.json({ error, checked }, { status: 502 });
    }

    const updates = new Map([...forcelog.updates, ...speedaf.updates]);
    const transporteurDe = new Map(
      leads.map((l) => [l.id, carrierOfLead(l.carrier) === "speedaf" ? "Speedaf" : "ForceLog"])
    );

    const updated = await Promise.all(
      [...updates.entries()].map(async ([id, changes]) => {
        const avant = leads.find((l) => l.id === id);
        const apres = await updateLead(id, changes);
        // Le transporteur signe ses propres changements : lire "Par
        // ForceLog" dans l'historique evite de croire qu'un collegue a
        // touche au statut de livraison.
        if (avant) {
          await recordLeadChanges(avant, apres, {
            name: transporteurDe.get(id) ?? "ForceLog",
          });
        }
        return apres;
      })
    );

    /*
     * Les envois qui n'ont pas abouti repartent ici.
     *
     * Cette route passe toutes les deux minutes ; c'est le seul
     * battement regulier de l'application. Sans cette reprise, une
     * coupure de n8n de quelques minutes perdrait definitivement les
     * messages de ces minutes-la — le client n'apprendrait jamais que
     * son colis est parti.
     *
     * Detache : un webhook lent ne doit pas retarder l'affichage des
     * statuts de livraison.
     */
    /*
     * Le livreur, pour les colis qui n'en ont pas encore.
     *
     * Demande apres les statuts, et sur quelques colis seulement : le
     * detail se lit un colis a la fois, et le livreur ne change plus
     * une fois connu. Le rattrapage s'etale donc sur plusieurs passages
     * plutot que d'inonder l'API a chacun.
     */
    const livreurs = await collectDeliverers(await listLeads());
    for (const [id, changes] of livreurs) await updateLead(id, changes);

    void retryPending();

    return NextResponse.json({ updated, checked, livreurs: livreurs.size });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}
