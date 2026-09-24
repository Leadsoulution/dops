import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { listRecentOrders, type WooOrder } from "./client";
import type { Lead } from "@/components/dashboard/leads-data";
import { sendPushToAll } from "@/lib/push";
import { recordLeadCreated } from "@/lib/supabase/lead-events";
import { emit } from "@/lib/webhooks/send";

/**
 * Reprise des commandes de la boutique dans l'application.
 *
 * Le fil complet d'une commande WooCommerce :
 *   1. elle arrive ici avec le SKU de ses articles
 *   2. le catalogue traduit ce SKU en code article transporteur
 *   3. le produit dit comment il part : colis simple ou colis de stock
 *   4. la commande confirmee part chez ForceLog avec la bonne reference
 *
 * Rien n'est devine : une commande dont le SKU n'est rattache a aucun
 * produit entre quand meme, en colis simple et sans reference. Elle sera
 * traitee a la main plutot que perdue.
 */

/** "14 sept. 2026, 09:12", comme les autres dates de l'application. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Casablanca",
  }).format(date);
  const time = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Casablanca",
  }).format(date);
  return `${day}, ${time}`;
}

/** Trois lettres tirees du nom, pour la vignette produit. */
function label(name: string): string {
  const cleaned = name.replace(/[^\p{L}\p{N} ]/gu, "").trim();
  return cleaned.slice(0, 4).toUpperCase() || "PRD";
}

type CatalogueEntry = {
  name: string;
  forcelogRef?: string;
  defaultParcelType: "simple" | "stock";
};

export type WooImportResult = {
  importees: number;
  deja: number;
  sansProduit: string[];
};

export async function importWooOrders(): Promise<WooImportResult> {
  const orders = await listRecentOrders();
  if (orders.length === 0) return { importees: 0, deja: 0, sansProduit: [] };

  const supabase = getSupabaseServerClient();

  const { data: productRows } = await supabase
    .from("products")
    .select("name,woo_sku,forcelog_ref,default_parcel_type")
    .not("woo_sku", "is", null);
  const catalogue = new Map<string, CatalogueEntry>(
    ((productRows ?? []) as {
      name: string;
      woo_sku: string;
      forcelog_ref: string | null;
      default_parcel_type: string;
    }[]).map((row) => [
      row.woo_sku,
      {
        name: row.name,
        forcelogRef: row.forcelog_ref ?? undefined,
        defaultParcelType: row.default_parcel_type === "stock" ? "stock" : "simple",
      },
    ])
  );

  // Les commandes deja reprises, pour ne pas les creer une seconde fois.
  const { data: knownRows } = await supabase
    .from("leads")
    .select("woo_order_id")
    .not("woo_order_id", "is", null);
  const known = new Set(
    ((knownRows ?? []) as { woo_order_id: number }[]).map((r) => r.woo_order_id)
  );

  const sansProduit = new Set<string>();
  const nouvelles: Partial<Lead>[] = [];

  for (const order of orders) {
    if (known.has(order.id)) continue;
    // Une commande annulee ou remboursee n'a pas a etre livree.
    if (["cancelled", "refunded", "failed", "trash"].includes(order.status)) {
      continue;
    }
    nouvelles.push(toLead(order, catalogue, sansProduit));
  }

  if (nouvelles.length > 0) {
    const { data: inserted, error } = await supabase
      .from("leads")
      .insert(nouvelles.map(toRow))
      .select("id,reference");
    if (error) throw new Error(error.message);

    const posees = (inserted ?? []) as { id: string; reference: string }[];

    await Promise.all(
      posees.map((row) =>
        recordLeadCreated(
          row.id,
          { name: "WooCommerce" },
          `Commande importee de la boutique (${row.reference})`
        )
      )
    );

    /*
     * Previent n8n de chaque commande qui entre.
     *
     * Le rapprochement se fait par reference et non par position :
     * Postgres ne promet pas de rendre les lignes inserees dans l'ordre
     * ou elles ont ete fournies, et une commande envoyee sous le nom
     * d'une autre ferait ecrire au mauvais client.
     */
    const parReference = new Map(nouvelles.map((l) => [l.reference, l]));
    for (const row of posees) {
      const lead = parReference.get(row.reference);
      if (lead) void emit("lead.created", { ...lead, id: row.id } as Lead);
    }

    // Previent les telephones, y compris application fermee. L'import
    // etant declenche par le webhook de la boutique, l'alerte part meme
    // si personne n'a l'application ouverte.
    const premiere = nouvelles[0];
    await sendPushToAll(
      nouvelles.length === 1
        ? {
            title: "Nouvelle commande",
            body: `${premiere.client} - ${premiere.amount}${premiere.ville ? ` - ${premiere.ville}` : ""}`,
            tag: `commande-${premiere.reference}`,
            kind: "order",
          }
        : {
            title: `${nouvelles.length} nouvelles commandes`,
            body: nouvelles.map((l) => l.client).slice(0, 3).join(", "),
            tag: "commandes",
            kind: "order",
          }
    );
  }

  return {
    importees: nouvelles.length,
    deja: orders.length - nouvelles.length,
    sansProduit: [...sansProduit],
  };
}

function toLead(
  order: WooOrder,
  catalogue: Map<string, CatalogueEntry>,
  sansProduit: Set<string>
): Partial<Lead> {
  const items = order.line_items ?? [];
  const matched = items
    .map((item) => ({ item, entry: item.sku ? catalogue.get(item.sku) : undefined }))
    .map(({ item, entry }) => {
      if (item.sku && !entry) sansProduit.add(item.sku);
      return { item, entry };
    });

  // Un colis de stock suppose que chaque article sait ou se prelever :
  // une commande mixte part en colis simple, plus sur que moitie-moitie.
  const stockable = matched.every(
    ({ entry }) => entry?.defaultParcelType === "stock" && entry.forcelogRef
  );

  const stockItems = stockable
    ? matched
        .map(({ item, entry }) => `${entry!.forcelogRef}:${item.quantity}`)
        .join(",")
    : undefined;

  const first = items[0];
  const client = [order.billing?.first_name, order.billing?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    reference: `WC-${order.number}`,
    client: client || "Client boutique",
    phone: order.billing?.phone ?? "",
    source: "WooCommerce",
    productName: first?.name ?? "",
    productLabel: label(first?.name ?? ""),
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0) || undefined,
    amount: `${Math.round(Number(order.total) || 0)} MAD`,
    status: "Nouveau",
    shipping: "En attente",
    assignedTo: "",
    date: formatDate(order.date_created),
    ville: order.shipping?.city || order.billing?.city || undefined,
    adresse: order.shipping?.address_1 || order.billing?.address_1 || undefined,
    parcelType: stockable ? "stock" : "simple",
    stockItems,
    wooOrderId: order.id,
  };
}

/** Mapping vers les colonnes de `leads`, en snake_case. */
function toRow(lead: Partial<Lead>) {
  return {
    reference: lead.reference,
    client: lead.client,
    phone: lead.phone,
    source: lead.source,
    product_name: lead.productName,
    product_label: lead.productLabel,
    item_count: lead.itemCount ?? null,
    amount: lead.amount,
    status: lead.status,
    shipping: lead.shipping,
    assigned_to: lead.assignedTo,
    date: lead.date,
    ville: lead.ville ?? null,
    adresse: lead.adresse ?? null,
    parcel_type: lead.parcelType,
    stock_items: lead.stockItems ?? null,
    woo_order_id: lead.wooOrderId,
  };
}
