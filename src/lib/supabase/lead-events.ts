import "server-only";
import { getSupabaseServerClient } from "./server";
import type { Lead } from "@/components/dashboard/leads-data";

/**
 * Journal des modifications.
 *
 * Seuls les champs qui racontent quelque chose sont suivis : le statut,
 * l'attribution, la livraison, le paiement, le suivi, et les
 * coordonnees du client. Journaliser tout noierait l'essentiel sous des
 * horodatages techniques.
 */

const TRACKED: { key: keyof Lead; label: string }[] = [
  { key: "status", label: "Statut de confirmation" },
  { key: "assignedTo", label: "Assigne a" },
  { key: "deliveryStatus", label: "Statut livraison" },
  { key: "paymentStatus", label: "Statut paiement" },
  { key: "trackingNumber", label: "Code suivi" },
  { key: "deliveryDate", label: "Date de livraison" },
  { key: "client", label: "Client" },
  { key: "phone", label: "Telephone" },
  { key: "ville", label: "Ville" },
  { key: "adresse", label: "Adresse" },
  { key: "amount", label: "Montant" },
  { key: "productName", label: "Produit" },
];

export type LeadEvent = {
  id: string;
  actorName: string;
  field: string;
  oldValue?: string;
  newValue?: string;
  createdAt: string;
};

export type Actor = { name: string; id?: string };

/**
 * Enregistre ce qui a reellement change entre deux etats, et retient le
 * dernier auteur sur la commande.
 *
 * N'echoue jamais : un journal qui tombe ne doit pas empecher une
 * commande d'etre modifiee.
 */
export async function recordLeadChanges(
  before: Lead,
  after: Lead,
  actor: Actor
): Promise<void> {
  const rows = TRACKED.filter((f) => {
    const a = before[f.key] ?? "";
    const b = after[f.key] ?? "";
    return String(a) !== String(b);
  }).map((f) => ({
    lead_id: after.id,
    actor_name: actor.name,
    actor_id: actor.id ?? null,
    field: f.label,
    old_value: before[f.key] ? String(before[f.key]) : null,
    new_value: after[f.key] ? String(after[f.key]) : null,
  }));

  if (rows.length === 0) return;

  try {
    const supabase = getSupabaseServerClient();
    await supabase.from("lead_events").insert(rows);
    await supabase
      .from("leads")
      .update({
        last_modified_by: actor.name,
        last_modified_at: new Date().toISOString(),
      })
      .eq("id", after.id);
  } catch {
    /* Journal indisponible : la modification reste enregistree. */
  }
}

/** Creation d'une commande : une entree, pour ouvrir son histoire. */
export async function recordLeadCreated(
  leadId: string,
  actor: Actor,
  detail: string
): Promise<void> {
  try {
    const supabase = getSupabaseServerClient();
    await supabase.from("lead_events").insert({
      lead_id: leadId,
      actor_name: actor.name,
      actor_id: actor.id ?? null,
      field: "Creation",
      new_value: detail,
    });
    await supabase
      .from("leads")
      .update({
        last_modified_by: actor.name,
        last_modified_at: new Date().toISOString(),
      })
      .eq("id", leadId);
  } catch {
    /* Sans consequence sur la commande creee. */
  }
}

export async function listLeadEvents(leadId: string): Promise<LeadEvent[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("lead_events")
    .select("id,actor_name,field,old_value,new_value,created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);
  return ((data ?? []) as {
    id: string;
    actor_name: string;
    field: string;
    old_value: string | null;
    new_value: string | null;
    created_at: string;
  }[]).map((row) => ({
    id: row.id,
    actorName: row.actor_name,
    field: row.field,
    oldValue: row.old_value ?? undefined,
    newValue: row.new_value ?? undefined,
    createdAt: row.created_at,
  }));
}
