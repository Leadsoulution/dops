import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, isSupabaseServerConfigured } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { sign } from "@/lib/webhooks/send";
import { buildPayload } from "@/lib/webhooks/payload";
import type { Lead } from "@/components/dashboard/leads-data";

/**
 * Envoi d'essai.
 *
 * Il part sur une commande reelle quand il en existe une : un exemple
 * invente laisserait croire que le scenario n8n fonctionne alors qu'il
 * n'a jamais vu un vrai nom arabe, un vrai numero, une vraie adresse.
 * A defaut seulement, un exemple est fabrique.
 *
 * L'essai ne passe pas par le journal : il ne doit ni etre reessaye, ni
 * salir l'historique des vrais envois.
 */
export async function POST(
  _request: NextRequest,
  ctx: RouteContext<"/api/webhooks/[id]/test">
) {
  if (!isSupabaseServerConfigured)
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });

  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Non connecte." }, { status: 401 });
  if (profile.role !== "Admin")
    return NextResponse.json({ error: "Reserve aux administrateurs." }, { status: 403 });

  const { id } = await ctx.params;
  const supabase = getSupabaseServerClient();

  const { data: hook } = await supabase
    .from("webhooks")
    .select("id,url,secret")
    .eq("id", id)
    .maybeSingle();
  if (!hook) return NextResponse.json({ error: "Abonnement introuvable." }, { status: 404 });

  const { data: rows } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);
  const derniere = (rows ?? [])[0] as Record<string, unknown> | undefined;

  const lead = {
    id: String(derniere?.id ?? "test"),
    reference: String(derniere?.reference ?? "TEST-001"),
    client: String(derniere?.client ?? "Client de test"),
    phone: String(derniere?.phone ?? "0600000000"),
    productName: String(derniere?.product_name ?? "Produit de test"),
    itemCount: Number(derniere?.item_count ?? 1),
    amount: String(derniere?.amount ?? "200 MAD"),
    status: String(derniere?.status ?? "Nouveau"),
    ville: (derniere?.ville as string) ?? "Casablanca",
    quartier: (derniere?.quartier as string) ?? undefined,
    adresse: (derniere?.adresse as string) ?? "Adresse de test",
    trackingNumber: (derniere?.tracking_number as string) ?? undefined,
    deliveryStatus: (derniere?.delivery_status as string) ?? undefined,
    deliveryStatusCode: (derniere?.delivery_status_code as string) ?? undefined,
    deliveryDate: (derniere?.delivery_date as string) ?? undefined,
    customerNote: (derniere?.customer_note as string) ?? undefined,
    date: String(derniere?.date ?? ""),
  } as unknown as Lead;

  const payload = buildPayload("lead.status_changed", lead);
  const body = JSON.stringify({ ...payload, test: true });
  const timestamp = String(Date.now());

  try {
    const res = await fetch(hook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Dops-Event": "lead.status_changed",
        "X-Dops-Timestamp": timestamp,
        "X-Dops-Signature": sign(hook.secret, timestamp, body),
        "X-Dops-Test": "true",
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    return NextResponse.json({
      ok: res.ok,
      httpStatus: res.status,
      reponse: (await res.text().catch(() => "")).slice(0, 400),
      envoye: JSON.parse(body),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Envoi impossible." },
      { status: 502 }
    );
  }
}
