import "server-only";
import { getSupabaseServerClient } from "./server";
import { resolveAttribution } from "./attribution";
import { getIntegrationSettings } from "./integrations";

/**
 * Paiement des agents de confirmation.
 *
 * L'equipe est payee a la commande livree : une somme fixe par colis
 * remis au client. On ne paie donc ni une confirmation qui n'aboutit
 * pas, ni un colis retourne — seul compte ce qui est arrive.
 *
 * L'agent credite est celui a qui revient la confirmation, avec la meme
 * regle que les statistiques : un administrateur qui rectifie un statut
 * ne se paie pas a la place de l'agent qui a passe l'appel.
 */

/** Tarif par defaut, en dirhams, modifiable dans l'ecran. */
export const DEFAULT_RATE = 11;

const SETTINGS_ID = "confirmation-payment";
const DELIVERED = "DELIVERED";
const CONFIRMED = new Set(["Confirme", "EXPIDER"]);
const STATUS_FIELD = "Statut de confirmation";

export type PayableOrder = {
  id: string;
  reference: string;
  client: string;
  trackingNumber: string;
  deliveryStatus: string;
  deliveryDate: string;
  amount: string;
  ville?: string;
  /** Agent a payer, ou vide si la commande n'a pu etre rattachee. */
  agent: string;
  paid: boolean;
  /** Somme reellement versee, figee au paiement. */
  paidAmount?: number;
  paidAt?: string;
  paidBy?: string;
};

export type AgentTotal = {
  agent: string;
  delivered: number;
  paid: number;
  unpaid: number;
  /** Deja verse, au tarif en vigueur au moment de chaque paiement. */
  paidAmount: number;
  /** Reste du, au tarif actuel. */
  dueAmount: number;
};

export type PaymentReport = {
  rate: number;
  orders: PayableOrder[];
  totals: AgentTotal[];
  /** Livraisons par jour, pour la courbe. */
  daily: { date: string; delivered: number; amount: number }[];
};

export async function getPaymentRate(): Promise<number> {
  const settings = await getIntegrationSettings<{ rate: string }>(SETTINGS_ID);
  const value = Number(settings.rate);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_RATE;
}

type LeadRow = {
  id: string;
  reference: string;
  client: string;
  ville: string | null;
  amount: string | null;
  tracking_number: string | null;
  delivery_status: string | null;
  delivery_status_code: string | null;
  delivery_date: string | null;
  confirmation_paid_at: string | null;
  confirmation_paid_amount: number | string | null;
  confirmation_paid_by: string | null;
};

type EventRow = {
  lead_id: string;
  actor_id: string | null;
  actor_name: string;
  field: string;
  new_value: string | null;
  created_at: string;
};

export async function getPaymentReport(
  from?: string,
  to?: string
): Promise<PaymentReport> {
  const supabase = getSupabaseServerClient();

  const [rate, leadsRes, profilesRes, eventsRes] = await Promise.all([
    getPaymentRate(),
    supabase
      .from("leads")
      .select(
        "id,reference,client,ville,amount,tracking_number,delivery_status,delivery_status_code,delivery_date,confirmation_paid_at,confirmation_paid_amount,confirmation_paid_by"
      )
      .eq("delivery_status_code", DELIVERED),
    supabase.from("profiles").select("id,name,role"),
    supabase
      .from("lead_events")
      .select("lead_id,actor_id,actor_name,field,new_value,created_at")
      .order("created_at", { ascending: true }),
  ]);

  if (leadsRes.error) throw new Error(leadsRes.error.message);
  if (profilesRes.error) throw new Error(profilesRes.error.message);
  if (eventsRes.error) throw new Error(eventsRes.error.message);

  const profiles = (profilesRes.data ?? []) as {
    id: string;
    name: string;
    role: string;
  }[];
  const adminIds = new Set(
    profiles.filter((p) => p.role === "Admin").map((p) => p.id)
  );
  const agentIds = new Set(
    profiles.filter((p) => p.role !== "Admin").map((p) => p.id)
  );
  const nameById = new Map(profiles.map((p) => [p.id, p.name]));

  const events = (eventsRes.data ?? []) as EventRow[];
  const attribution = resolveAttribution(events, adminIds, agentIds);

  // L'agent credite de la confirmation de chaque commande : c'est ce
  // geste-la qui se paie, pas la derniere main passee sur la ligne.
  const agentByLead = new Map<string, string>();
  for (const event of events) {
    if (event.field !== STATUS_FIELD) continue;
    if (!event.new_value || !CONFIRMED.has(event.new_value)) continue;
    const credited = attribution.get(event);
    if (credited) agentByLead.set(event.lead_id, nameById.get(credited) ?? "");
  }

  const leads = (leadsRes.data ?? []) as LeadRow[];

  const orders: PayableOrder[] = leads
    .filter((lead) => withinPeriod(lead.delivery_date, from, to))
    .map((lead) => ({
      id: lead.id,
      reference: lead.reference,
      client: lead.client,
      trackingNumber: lead.tracking_number ?? "",
      deliveryStatus: lead.delivery_status ?? "Livre",
      deliveryDate: lead.delivery_date ?? "",
      amount: lead.amount ?? "",
      ville: lead.ville ?? undefined,
      agent: agentByLead.get(lead.id) ?? "",
      paid: Boolean(lead.confirmation_paid_at),
      paidAmount:
        lead.confirmation_paid_amount === null
          ? undefined
          : Number(lead.confirmation_paid_amount),
      paidAt: lead.confirmation_paid_at ?? undefined,
      paidBy: lead.confirmation_paid_by ?? undefined,
    }))
    // La plus recente livraison en tete : c'est celle qu'on vient payer.
    .sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate));

  const byAgent = new Map<string, AgentTotal>();
  for (const order of orders) {
    const key = order.agent || "Non attribuee";
    const total =
      byAgent.get(key) ??
      { agent: key, delivered: 0, paid: 0, unpaid: 0, paidAmount: 0, dueAmount: 0 };
    total.delivered += 1;
    if (order.paid) {
      total.paid += 1;
      total.paidAmount += order.paidAmount ?? 0;
    } else {
      total.unpaid += 1;
      total.dueAmount += rate;
    }
    byAgent.set(key, total);
  }

  // Livraisons par jour : la courbe montre le rythme, pas seulement le
  // total, et c'est le rythme qui dit si le mois sera lourd a payer.
  const perDay = new Map<string, { delivered: number; amount: number }>();
  for (const order of orders) {
    const day = order.deliveryDate.slice(0, 10);
    if (!day) continue;
    const entry = perDay.get(day) ?? { delivered: 0, amount: 0 };
    entry.delivered += 1;
    entry.amount += order.paid ? (order.paidAmount ?? 0) : rate;
    perDay.set(day, entry);
  }

  return {
    rate,
    orders,
    totals: [...byAgent.values()].sort((a, b) => b.delivered - a.delivered),
    daily: [...perDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v })),
  };
}

/**
 * La date de livraison est enregistree en "AAAA-MM-JJ HH:MM", heure du
 * Maroc. Les bornes arrivent en ISO : on compare sur le jour, ce qui
 * suffit pour un ecran de paiement et evite un decalage de fuseau.
 */
function withinPeriod(
  deliveryDate: string | null,
  from?: string,
  to?: string
): boolean {
  if (!deliveryDate) return false;
  const day = deliveryDate.slice(0, 10);
  if (from && day < from.slice(0, 10)) return false;
  if (to && day > to.slice(0, 10)) return false;
  return true;
}
