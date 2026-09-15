import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getIntegrationSettings } from "@/lib/supabase/integrations";
import { listLeads, updateLead } from "@/lib/supabase/leads";
import { recordLeadChanges } from "@/lib/supabase/lead-events";
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
 *
 * Lire ne suffit pourtant pas a decider. Entre deux synchronisations, la
 * feuille porte encore ce qu'on y avait ecrit : un statut change dans
 * l'application y apparait donc comme "different", et le reappliquer
 * annulerait le changement. On retient donc ce qu'on a ecrit la derniere
 * fois. Une valeur identique a notre dernier envoi veut dire que
 * personne n'y a touche, et c'est l'application qui fait foi ; une
 * valeur differente veut dire qu'une main est passee par la.
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

/** Le releve precedent, ou rien si la forme enregistree est illisible. */
function parseMirror(raw?: string): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

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

  const settings = await getIntegrationSettings<Record<string, string>>(
    "google-sheets"
  );
  const lastMirror: Record<string, string> = parseMirror(settings.lastMirror);

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

    // La feuille affiche encore ce que nous y avions ecrit : elle est
    // simplement en retard, pas modifiee. L'application fait foi.
    if (lastMirror[reference] === statut) continue;

    // Une valeur inconnue n'est pas appliquee : une faute de frappe dans
    // la feuille ne doit pas donner un statut fantaisiste a une commande.
    if (!VALID_STATUSES.has(statut)) {
      ignores.push(`${reference} : "${statut}"`);
      continue;
    }

    let updated = await updateLead(lead.id, { status: statut as LeadStatus });
    await recordLeadChanges(lead, updated, { name: "Google Sheets" });

    // Confirmer depuis la feuille doit expedier comme confirmer depuis
    // l'application : sans cela, une commande passee a "Confirme" dans
    // la feuille resterait chez nous sans que personne s'en apercoive.
    if (statut === AUTO_DISPATCH_STATUS && !updated.trackingNumber) {
      const avantEnvoi = updated;
      updated = await updateLead(updated.id, await dispatchToForceLog(updated));
      await recordLeadChanges(avantEnvoi, updated, { name: "ForceLog" });
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

  // Trace de ce qui vient d'etre ecrit, pour distinguer la prochaine
  // fois une feuille en retard d'une feuille modifiee a la main.
  const mirror: Record<string, string> = {};
  for (const lead of leads) mirror[lead.reference] = lead.status;

  await getSupabaseServerClient()
    .from("integration_settings")
    .update({
      settings: { ...settings, lastMirror: JSON.stringify(mirror) },
      updated_at: new Date().toISOString(),
    })
    .eq("id", "google-sheets");

  return { ecrites: leads.length, statutsRepris, ignores };
}
