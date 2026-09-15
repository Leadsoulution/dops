import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { listLeadEvents } from "@/lib/supabase/lead-events";

/** Journal des modifications d'une commande. */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/leads/[id]/events">
) {
  const profile = await getSessionProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non connecte." }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    return NextResponse.json({ events: await listLeadEvents(id) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}
