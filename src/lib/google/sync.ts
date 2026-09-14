import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { listLeads, updateLead } from "@/lib/supabase/leads";
import type { Lead, LeadStatus } from "@/components/dashboard/leads-data";
import { leadStatusOptions } from "@/components/dashboard/leads-data";
import { AUTO_DISPATCH_STATUS, dispatchToForceLog } from "@/lib/forcelog/dispatch";
import {
  ensureSheetExists,
  isSheetsConfigured,
  readColumn,
  SHEET_HEADERS,
  STATUS_COLUMN_INDEX,
  writeRange,
} from "./sheets";

/**
 * Synchronisation avec la feuille de sauvegarde.
 *
 * Deux sens, volontairement asymetriques :
 *   - l'application ecrit tout : la feuille est un miroir
 *   - la feuille ne renvoie que le statut de confirmation
 *
 * L'ordre des deux operations n'est pas indifferent. On lit d'abord,
 * on ecrit ensuite : l'inverse ecraserait un statut saisi dans la
 * feuille avant meme de l'avoir vu.
 */

/** "Statut de confirmation" est la 12e colonne, soit L. */
const STATUS_LETTER = String.fromCharCode(65 + STATUS_COLUMN_INDEX);
const LAST_LETTER = String.fromCharCode(65 + SHEET_HEADERS.length - 1);

/** Statuts qu'une saisie dans la feuille peut donner a une commande. */
const VALID_STATUSES = new Set(
  leadStatusOptions.filter((s) => s !== "Aucun changement")
);

export type SheetSyncResult = {
  ecrites: number;
  statutsRepris: number;
  ignores: string[];
};

function row(lead: Lead): (string | number)[] {
  return [
    lead.reference,
    lead.date,
    lead.client,
    lead.phone,
    lead.ville ?? "",
    lead.adresse ?? "",
    lead.productName,
    lead.itemCount ?? 1,
    lead.amount,
    lead.source,
    lead.assignedTo,
    lead.status,
    lead.trackingNumber ? "ForceLog" : "",
    lead.trackingNumber ?? "",
    lead.deliveryStatus ?? "",
    lead.paymentStatus ?? "",
    lead.deliveryDate ?? "",
  ];
}

export async function syncSheet(): Promise<SheetSyncResult> {
  if (!(await isSheetsConfigured())) {
    throw new Error("Aucune feuille Google configuree.");
  }
  await ensureSheetExists();

  const leads = await listLeads();
  const byReference = new Map(leads.map((l) => [l.reference, l]));

  // 1. La feuille d'abord : un statut saisi la-bas doit etre lu avant
  //    d'etre recouvert par l'ecriture qui suit.
  const existing = await readColumn(STATUS_LETTER);
  const ignores: string[] = [];
  let statutsRepris = 0;

  for (const line of existing.slice(1)) {
    const reference = (line[0] ?? "").trim();
    const statut = (line[STATUS_COLUMN_INDEX] ?? "").trim();
    if (!reference || !statut) continue;

    const lead = byReference.get(reference);
    if (!lead || lead.status === statut) continue;

    // Une valeur inconnue n'est pas appliquee : une faute de frappe dans
    // la feuille ne doit pas donner un statut fantaisiste a une commande.
    if (!VALID_STATUSES.has(statut)) {
      ignores.push(`${reference} : "${statut}"`);
      continue;
    }

    let updated = await updateLead(lead.id, { status: statut as LeadStatus });

    // Confirmer depuis la feuille doit expedier comme confirmer depuis
    // l'application : sans cela, une commande passee a "Confirme" dans
    // la feuille resterait chez nous sans que personne s'en apercoive.
    if (statut === AUTO_DISPATCH_STATUS && !updated.trackingNumber) {
      updated = await updateLead(updated.id, await dispatchToForceLog(updated));
    }

    Object.assign(lead, updated);
    statutsRepris += 1;
  }

  // 2. Puis le miroir complet, en-tete comprise.
  const values = [SHEET_HEADERS, ...leads.map(row)];
  await writeRange(`A1:${LAST_LETTER}${values.length}`, values);

  // Les lignes devenues surnumeraires sont videes : une commande
  // supprimee dans l'application ne doit pas survivre dans la feuille.
  const surplus = existing.length - values.length;
  if (surplus > 0) {
    await writeRange(
      `A${values.length + 1}:${LAST_LETTER}${existing.length}`,
      Array.from({ length: surplus }, () => SHEET_HEADERS.map(() => ""))
    );
  }

  await getSupabaseServerClient()
    .from("integration_settings")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", "google-sheets");

  return { ecrites: leads.length, statutsRepris, ignores };
}
