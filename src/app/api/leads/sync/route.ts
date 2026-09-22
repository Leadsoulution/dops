import { NextResponse } from "next/server";
import { listLeads, updateLead } from "@/lib/supabase/leads";
import { recordLeadChanges } from "@/lib/supabase/lead-events";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";
import { collectStatusUpdates } from "@/lib/forcelog/dispatch";
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
    const { updates, checked, error } = await collectStatusUpdates(leads);

    if (error) {
      return NextResponse.json({ error, checked }, { status: 502 });
    }

    const updated = await Promise.all(
      [...updates.entries()].map(async ([id, changes]) => {
        const avant = leads.find((l) => l.id === id);
        const apres = await updateLead(id, changes);
        // Le transporteur signe ses propres changements : lire "Par
        // ForceLog" dans l'historique evite de croire qu'un collegue a
        // touche au statut de livraison.
        if (avant) await recordLeadChanges(avant, apres, { name: "ForceLog" });
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
    void retryPending();

    return NextResponse.json({ updated, checked });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}
