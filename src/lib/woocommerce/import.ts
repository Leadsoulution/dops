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

/** Code Postgres d'une violation d'unicite. */
const DOUBLON = "23505";

function estDoublon(error: { code?: string } | null): boolean {
  return error?.code === DOUBLON;
}

/**
 * Pose les nouvelles commandes, sans qu'une seule en bloque d'autres.
 *
 * L'insertion se fait d'un bloc, ce qui est le plus rapide. Mais une
 * commande deja presente fait echouer tout le bloc, et deux
 * notifications de la boutique arrivees en meme temps lisent la meme
 * liste : chacune croit avoir du nouveau. On repasse alors ligne par
 * ligne, en laissant tomber les doublons et en gardant le reste.
 */
async function inserer(
  rows: ReturnType<typeof toRow>[]
): Promise<{ id: string; reference: string }[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("leads")
    .insert(rows)
    .select("id,reference");

  if (!error) return (data ?? []) as { id: string; reference: string }[];
  if (!estDoublon(error)) throw new Error(error.message);

  const posees: { id: string; reference: string }[] = [];
  for (const row of rows) {
    const { data: une, error: erreur } = await supabase
      .from("leads")
      .insert(row)
      .select("id,reference")
      .single();
    if (erreur) {
      if (!estDoublon(erreur)) throw new Error(erreur.message);
      continue;
    }
    if (une) posees.push(une as { id: string; reference: string });
  }
  return posees;
}

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

  /*
   * Les commandes deja reprises — cherchees parmi celles-ci seulement.
   *
   * La question etait posee a toute la table : "donne-moi tous les
   * numeros de commande de la boutique". Supabase s'arrete a mille
   * lignes sans le dire. Passe la milliemme commande, les plus
   * recentes manquaient a la reponse : elles repassaient pour
   * nouvelles, l'index unique refusait de les reinserer, et comme
   * l'insertion part d'un seul bloc, plus aucune commande n'entrait.
   * La boutique a vendu cinq heures sans que rien n'arrive dans
   * l'application.
   *
   * On ne demande donc que les numeros qu'on s'apprete a traiter : la
   * reponse ne peut plus depasser la page lue chez la boutique.
   */
  const numeros = orders.map((o) => o.id);
  const { data: knownRows } = await supabase
    .from("leads")
    .select("woo_order_id")
    .in("woo_order_id", numeros);
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

  let importees = 0;

  if (nouvelles.length > 0) {
    const posees = await inserer(nouvelles.map(toRow));
    importees = posees.length;

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
    // Ce qui est reellement entre, et non ce qu'on s'appretait a poser :
    // un doublon ecarte en cours de route ne doit pas etre annonce
    // comme une commande importee.
    importees,
    deja: orders.length - importees,
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

  const attribution = orderAttribution(order);

  const first = items[0];

  /*
   * Le nom du produit vient du catalogue, pas du titre de la boutique.
   *
   * La boutique vend `LOR-ROSE-V2` sous le titre de `LOR-ROSE` : les
   * deux references sont distinctes, leurs articles aussi, mais la
   * fiche du site a garde l'ancien intitule. La commande arrivait donc
   * sous le nom du mauvais produit — le bon article partait chez le
   * transporteur, puisque la reference vient du code article, mais
   * l'agent lisait autre chose a l'ecran, et la photo suivait le nom.
   *
   * Le code article est ce que le client a reellement achete : c'est
   * lui qui nomme la commande. Un code inconnu du catalogue garde le
   * titre de la boutique — mieux vaut son nom que pas de nom.
   */
  const nomProduit = matched[0]?.entry?.name ?? first?.name ?? "";
  const client = [order.billing?.first_name, order.billing?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    reference: `WC-${order.number}`,
    client: client || "Client boutique",
    phone: order.billing?.phone ?? "",
    source: "WooCommerce",
    productName: nomProduit,
    productLabel: label(nomProduit),
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
    ...attribution,
  };
}

/**
 * L'origine du trafic, telle que WooCommerce l'a enregistree.
 *
 * Depuis la version 8.5 il note d'ou vient chaque commande dans ses
 * champs libres, et c'est ce que sa colonne "Origin" montre. La valeur
 * est brute — "fb", "ig" — et arrive ici sans etre traduite : c'est
 * l'affichage qui la reconnaitra, et garder l'original permet de
 * rattraper une plateforme oubliee sans resynchroniser la boutique.
 *
 * `utm_campaign` porte l'identifiant de campagne du gestionnaire de
 * publicites. Il n'est pas utilise aujourd'hui, mais c'est lui qui
 * permettra un jour de relier une commande a la campagne qui l'a
 * payee, et il ne coute rien a conserver.
 */
const ATTRIBUTION_PREFIX = "_wc_order_attribution_";

function orderAttribution(order: WooOrder) {
  const meta = new Map(
    (order.meta_data ?? []).map((m) => [m.key, m.value])
  );
  const lire = (nom: string) => {
    const brut = meta.get(`${ATTRIBUTION_PREFIX}${nom}`);
    const valeur = typeof brut === "string" ? brut.trim() : "";
    return valeur || undefined;
  };
  return {
    utmSource: lire("utm_source"),
    utmMedium: lire("utm_medium"),
    utmCampaign: lire("utm_campaign"),
    utmContent: lire("utm_content"),
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
    utm_source: lead.utmSource ?? null,
    utm_medium: lead.utmMedium ?? null,
    utm_campaign: lead.utmCampaign ?? null,
    utm_content: lead.utmContent ?? null,
  };
}
