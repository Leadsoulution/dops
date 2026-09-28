import { NextResponse, type NextRequest } from "next/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { listAdAccounts, ACTIF } from "@/lib/supabase/ad-accounts";
import { syncAdAccount, type SyncResult } from "@/lib/ads/sync";

/**
 * Releve les campagnes et les depenses des comptes branches.
 *
 * Un compte suspendu est passe sans bruit : il n'a plus de jeton, et
 * echouer sur lui a chaque appel remplirait le journal d'erreurs
 * attendues.
 *
 * Les comptes sont traites l'un apres l'autre, non en parallele : les
 * deux plateformes limitent le nombre d'appels par minute, et se faire
 * repousser fait perdre plus de temps que d'attendre son tour.
 */

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non connecte." }, { status: 401 });
  }
  if (profile.role !== "Admin") {
    return NextResponse.json(
      { error: "Reserve aux administrateurs." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const seulement = body.accountId ? String(body.accountId) : null;
    const jours = Number(body.days) > 0 ? Math.min(Number(body.days), 90) : undefined;

    const comptes = (await listAdAccounts()).filter(
      (a) => a.status === ACTIF && (!seulement || a.id === seulement)
    );

    const results: SyncResult[] = [];
    for (const compte of comptes) {
      results.push(
        await syncAdAccount(compte.id, compte.platform, compte.externalId, jours)
      );
    }

    return NextResponse.json({
      results,
      synced: results.filter((r) => !r.error).length,
      failed: results.filter((r) => r.error).length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}
