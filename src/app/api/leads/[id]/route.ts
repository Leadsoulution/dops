import { NextRequest, NextResponse } from "next/server";
import {
  clearTracking,
  deleteLead,
  listLeads,
  updateLead,
} from "@/lib/supabase/leads";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { recordLeadChanges } from "@/lib/supabase/lead-events";
import { AUTO_DISPATCH_STATUS, shouldDispatch } from "@/lib/forcelog/dispatch";
import { dispatchLead } from "@/lib/carriers/dispatch";
import { cancelSpeedafParcel, colisARefaire } from "@/lib/speedaf/amend";

function notConfigured() {
  return NextResponse.json(
    { error: "Supabase non configure." },
    { status: 500 }
  );
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/leads/[id]">
) {
  if (!isSupabaseServerConfigured) return notConfigured();
  const { id } = await ctx.params;

  let changes;
  try {
    changes = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  try {
    const profile = await getSessionProfile();
    const actor = { name: profile?.name ?? "Systeme", id: profile?.id };
    const avant = (await listLeads()).find((l) => l.id === id);

    let lead = await updateLead(id, changes);
    if (avant) await recordLeadChanges(avant, lead, actor);

    /*
     * Une correction qui arrive apres le depart du colis.
     *
     * Speedaf ne sait pas modifier un colis : pour que le livreur
     * parte avec la bonne adresse, il faut annuler celui qui existe et
     * en creer un autre. Sans cela, l'ecran afficherait la correction
     * et le terrain garderait l'ancienne version — une modification
     * qui a l'air d'avoir reussi est pire qu'un bouton absent.
     *
     * La commande doit toujours etre confirmee : si l'agent vient de
     * la passer en annulee ou reportee, refaire un colis irait
     * exactement contre ce qu'il demande.
     */
    if (
      avant &&
      lead.status === AUTO_DISPATCH_STATUS &&
      colisARefaire(avant, lead)
    ) {
      const annulation = await cancelSpeedafParcel(
        lead,
        "Commande corrigee par le vendeur"
      );
      if (annulation.ok) {
        const vide = await clearTracking(id);
        lead = await updateLead(id, await dispatchLead(vide));
        await recordLeadChanges(vide, lead, { name: "Speedaf" });
      } else {
        // Le colis d'origine reste vivant : on dit lequel et pourquoi,
        // plutot que d'en creer un second a cote.
        lead = await updateLead(id, {
          trackingError: `Colis non modifie chez Speedaf : ${annulation.raison}`,
        });
      }
    } else if (shouldDispatch(lead)) {
      const avantEnvoi = lead;
      lead = await updateLead(id, await dispatchLead(lead));
      await recordLeadChanges(avantEnvoi, lead, { name: "ForceLog" });
    }

    return NextResponse.json({ lead });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/leads/[id]">
) {
  if (!isSupabaseServerConfigured) return notConfigured();
  const { id } = await ctx.params;

  // Supprimer une commande est sans retour : reserve aux
  // administrateurs, et verifie ici. Masquer le bouton ne protege rien,
  // la requete pouvant etre envoyee sans passer par l'interface.
  const profile = await getSessionProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non connecte." }, { status: 401 });
  }
  if (profile.role !== "Admin") {
    return NextResponse.json(
      { error: "Seul un administrateur peut supprimer une commande." },
      { status: 403 }
    );
  }

  try {
    await deleteLead(id);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}
