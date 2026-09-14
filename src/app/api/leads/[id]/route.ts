import { NextRequest, NextResponse } from "next/server";
import { deleteLead, updateLead } from "@/lib/supabase/leads";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { AUTO_DISPATCH_STATUS, dispatchToForceLog } from "@/lib/forcelog/dispatch";

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
    let lead = await updateLead(id, changes);

    // Meme regle que pour la mise a jour groupee : une commande confirmee
    // part chez ForceLog si elle n'y est pas deja.
    if (changes.status === AUTO_DISPATCH_STATUS && !lead.trackingNumber) {
      lead = await updateLead(id, await dispatchToForceLog(lead));
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
