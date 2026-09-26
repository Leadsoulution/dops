import { NextResponse, type NextRequest } from "next/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { getSupabaseServerClient, isSupabaseServerConfigured } from "@/lib/supabase/server";
import { saveIntegrationSettings } from "@/lib/supabase/integrations";
import { getPaymentRate, getPaymentReport } from "@/lib/supabase/confirmation-pay";

/**
 * Suivi du paiement des agents de confirmation.
 *
 * Trois droits distincts, et l'asymetrie est voulue.
 *
 * Consulter : tout le monde. Un agent doit pouvoir verifier ce qui lui
 * est du.
 *
 * Pointer une commande payee : tout le monde aussi. C'est l'agent qui
 * sait ce qu'il a recu, et l'attendre pour le noter faisait du
 * pointage une corvee d'administrateur. La ligne garde le nom de qui
 * l'a pointee.
 *
 * Defaire un pointage ou changer le tarif : administrateur seul. Ce
 * sont les deux gestes qui reecrivent le passe, et celui qui encaisse
 * ne doit pas pouvoir effacer la trace de ce qu'il a encaisse.
 */
const SETTINGS_ID = "confirmation-payment";

export async function GET(request: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non connecte." }, { status: 401 });
  }
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }

  const from = request.nextUrl.searchParams.get("from") ?? undefined;
  const to = request.nextUrl.searchParams.get("to") ?? undefined;

  try {
    return NextResponse.json({
      ...(await getPaymentReport(from, to)),
      /** Pointer un paiement : ouvert a tous. */
      canPay: true,
      /** Defaire un pointage, changer le tarif : administrateurs seuls. */
      canEdit: profile.role === "Admin",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non connecte." }, { status: 401 });
  }
  const isAdmin = profile.role === "Admin";

  try {
    const body = await request.json();

    // Changement de tarif : il ne vaut que pour les paiements a venir,
    // les sommes deja versees etant copiees sur la commande.
    if (body.rate !== undefined) {
      if (!isAdmin) {
        return NextResponse.json(
          { error: "Seul un administrateur change le tarif." },
          { status: 403 }
        );
      }
      const rate = Number(body.rate);
      if (!Number.isFinite(rate) || rate < 0) {
        return NextResponse.json({ error: "Tarif invalide." }, { status: 400 });
      }
      await saveIntegrationSettings(SETTINGS_ID, { rate: String(rate) });
      return NextResponse.json({ rate });
    }

    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: "Aucune commande." }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    if (body.paid === false) {
      // Defaire un pointage efface la trace d'un versement : c'est le
      // geste qu'un agent ne doit pas pouvoir poser sur son propre du.
      if (!isAdmin) {
        return NextResponse.json(
          { error: "Seul un administrateur peut annuler un paiement." },
          { status: 403 }
        );
      }
      const { error } = await supabase
        .from("leads")
        .update({
          confirmation_paid_at: null,
          confirmation_paid_amount: null,
          confirmation_paid_by: null,
        })
        .in("id", ids);
      if (error) throw new Error(error.message);
      return NextResponse.json({ updated: ids.length, paid: false });
    }

    // Le tarif est copie maintenant : le relire plus tard reecrirait le
    // passe a chaque changement de tarif.
    const rate = await getPaymentRate();
    const { error } = await supabase
      .from("leads")
      .update({
        confirmation_paid_at: new Date().toISOString(),
        confirmation_paid_amount: rate,
        confirmation_paid_by: profile.name,
      })
      .in("id", ids);
    if (error) throw new Error(error.message);

    return NextResponse.json({ updated: ids.length, paid: true, rate });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 400 }
    );
  }
}
