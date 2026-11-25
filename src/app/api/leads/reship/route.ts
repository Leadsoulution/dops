import { NextRequest, NextResponse } from "next/server";
import { listLeads, updateLead } from "@/lib/supabase/leads";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { listLeadEvents, recordLeadChanges } from "@/lib/supabase/lead-events";
import { dispatchLead } from "@/lib/carriers/dispatch";
import { referenceRenvoi, refusDeRenvoi } from "@/lib/carriers/reship";
import type { Lead } from "@/components/dashboard/leads-data";

/**
 * Renvoyer des commandes revenues.
 *
 * Le colis repart neuf chez le transporteur ; la commande, elle, ne
 * bouge pas d'Orderly. En creer une deuxieme compterait deux ventes,
 * deux fois le chiffre d'affaires et deux unites sorties du stock pour
 * un seul client qui attend un seul colis.
 *
 * Ce qui change sur la commande est exactement ce qui appartient au
 * colis : son numero de suivi, son statut de livraison, son livreur,
 * sa date de remise. Le client, le produit, le prix et le statut de
 * confirmation restent ce qu'ils etaient.
 *
 * Plusieurs commandes dans un seul appel : l'ecran en coche plusieurs
 * a la fois, et un aller-retour par commande ferait relire la table
 * entiere a chaque fois.
 */

/** Au-dela, c'est que le transporteur ne cree plus rien de neuf. */
const ESSAIS_MAX = 3;

export async function POST(request: NextRequest) {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }
  const profile = await getSessionProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non connecte." }, { status: 401 });
  }

  let ids: string[];
  try {
    const body = await request.json();
    ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }
  if (ids.length === 0) {
    return NextResponse.json({ error: "Aucune commande choisie." }, { status: 400 });
  }

  const actor = { name: profile.name, id: profile.id };

  try {
    const toutes = await listLeads();
    const renvoyees: Lead[] = [];
    const refus: { reference: string; raison: string }[] = [];

    for (const id of ids) {
      const lead = toutes.find((l) => l.id === id);
      if (!lead) continue;

      const raison = refusDeRenvoi(lead);
      if (raison) {
        refus.push({ reference: lead.reference, raison });
        continue;
      }

      /*
       * Combien de colis cette commande a-t-elle deja eus ?
       *
       * Le journal le sait : chaque colis cree y a inscrit son numero
       * de suivi. Le compter evite de redemander une reference deja
       * utilisee, que le transporteur rendrait a l'identique.
       */
      const evenements = await listLeadEvents(id).catch(() => []);
      const dejaEnvoyes = evenements.filter(
        (e) => e.field === "Code suivi" && e.newValue
      ).length;

      let essai = Math.max(dejaEnvoyes + 1, 2);
      let resultat: Partial<Lead> | null = null;

      for (let i = 0; i < ESSAIS_MAX; i += 1, essai += 1) {
        /*
         * Le transporteur est celui qui expedie aujourd'hui, pas celui
         * qui a rendu le colis. La repartition reglee dans les
         * integrations decide, comme pour une commande neuve : une
         * commande revenue d'un transporteur qu'on n'utilise plus
         * repartirait sinon chez lui indefiniment.
         */
        const essaye = await dispatchLead({
          ...lead,
          carrier: undefined,
          reference: referenceRenvoi(lead.reference, essai),
        });

        if (essaye.trackingError) {
          refus.push({ reference: lead.reference, raison: essaye.trackingError });
          resultat = null;
          break;
        }
        // Le meme numero qu'avant : le transporteur a reconnu la
        // reference et rendu le colis revenu au lieu d'en creer un.
        // On recommence sous la suivante.
        if (essaye.trackingNumber && essaye.trackingNumber !== lead.trackingNumber) {
          resultat = essaye;
          break;
        }
      }

      if (!resultat) {
        if (!refus.some((r) => r.reference === lead.reference)) {
          refus.push({
            reference: lead.reference,
            raison: "Le transporteur a rendu le colis deja existant.",
          });
        }
        continue;
      }

      const apres = await updateLead(id, {
        ...resultat,
        // Tout ce qui appartenait a l'ancien colis s'en va avec lui :
        // l'ancien livreur ne porte plus rien, et la marchandise
        // rentree au depot vient d'en ressortir.
        deliverer: "",
        delivererPhone: "",
        deliveryDate: "",
        restockedAt: "",
      });
      await recordLeadChanges(lead, apres, actor);
      renvoyees.push(apres);
    }

    return NextResponse.json({ leads: renvoyees, refus });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}
