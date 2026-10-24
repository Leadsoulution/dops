import { NextRequest, NextResponse } from "next/server";
import { clearTracking, listLeads } from "@/lib/supabase/leads";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { recordLeadChanges } from "@/lib/supabase/lead-events";
import { cancelSpeedafParcel } from "@/lib/speedaf/amend";

/**
 * L'envoi d'une commande, sans la commande.
 *
 * Annuler un colis n'est pas supprimer une commande : le client existe
 * toujours, l'historique aussi, et la commande redevient simplement
 * une commande qu'on n'a confiee a personne. C'est pour cela que cette
 * route est a part — se tromper de bouton ne doit pas effacer une
 * vente.
 *
 * Reservee aux administrateurs, comme la suppression : un colis annule
 * par erreur est un client qui attend un paquet qui ne partira pas.
 */
export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/leads/[id]/shipment">
) {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }
  const { id } = await ctx.params;

  const profile = await getSessionProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non connecte." }, { status: 401 });
  }
  if (profile.role !== "Admin") {
    return NextResponse.json(
      { error: "Seul un administrateur peut annuler un envoi." },
      { status: 403 }
    );
  }

  // Le motif voyage jusqu'a Speedaf, qui l'enregistre sur le colis.
  let raison = "Annule par le vendeur";
  try {
    const corps = await request.json();
    if (typeof corps?.reason === "string" && corps.reason.trim()) {
      raison = corps.reason.trim().slice(0, 200);
    }
  } catch {
    /* Pas de corps : le motif par defaut suffit. */
  }

  try {
    const lead = (await listLeads()).find((l) => l.id === id);
    if (!lead) {
      return NextResponse.json({ error: "Commande introuvable." }, { status: 404 });
    }

    const annulation = await cancelSpeedafParcel(lead, raison);
    if (!annulation.ok) {
      // 409 et non 500 : rien n'est casse, c'est le transporteur qui
      // refuse, et son motif est la vraie reponse.
      return NextResponse.json({ error: annulation.raison }, { status: 409 });
    }

    const apres = await clearTracking(id);
    await recordLeadChanges(lead, apres, {
      name: profile.name ?? "Systeme",
      id: profile.id,
    });
    return NextResponse.json({ lead: apres });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}
