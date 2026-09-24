import { getSupabaseServerClient } from "./server";
import { fetchAll } from "./page";
import { emit } from "@/lib/webhooks/send";
import { cityKey, tariffByCityForm } from "./cities";
import type { Lead, LeadSource, LeadStatus } from "@/components/dashboard/leads-data";

/**
 * Data access for the `leads` table.
 *
 * The database uses snake_case columns while the app's `Lead` type is
 * camelCase, so every read goes through `toLead` and every write through
 * `toRow`. Keeping the mapping here means components keep working with
 * the exact same `Lead` shape they used when the data was static.
 */

type LeadRow = {
  id: string;
  reference: string;
  product_label: string | null;
  product_name: string | null;
  item_count: number | null;
  client: string;
  phone: string;
  source: string | null;
  assigned_to: string | null;
  amount: string | null;
  status: string;
  shipping: string | null;
  date: string | null;
  ville: string | null;
  tarif: string | null;
  quartier: string | null;
  adresse: string | null;
  tracking_number: string | null;
  tracking_error: string | null;
  delivery_status: string | null;
  delivery_status_code: string | null;
  payment_status: string | null;
  deliverer: string | null;
  deliverer_phone: string | null;
  delivery_date: string | null;
  parcel_type: string | null;
  stock_items: string | null;
  customer_note: string | null;
  restocked_at: string | null;
  woo_order_id: number | null;
  last_modified_by: string | null;
  last_modified_at: string | null;
};

function toLead(row: LeadRow): Lead {
  return {
    id: row.id,
    reference: row.reference,
    productLabel: row.product_label ?? "",
    productName: row.product_name ?? "",
    itemCount: row.item_count ?? undefined,
    client: row.client,
    phone: row.phone,
    source: (row.source ?? "nouveau") as LeadSource,
    assignedTo: row.assigned_to ?? "",
    amount: row.amount ?? "",
    status: row.status as LeadStatus,
    shipping: row.shipping ?? "En attente",
    date: row.date ?? "",
    ville: row.ville ?? undefined,
    tarif: row.tarif ?? undefined,
    quartier: row.quartier ?? undefined,
    adresse: row.adresse ?? undefined,
    trackingNumber: row.tracking_number ?? undefined,
    trackingError: row.tracking_error ?? undefined,
    deliveryStatus: row.delivery_status ?? undefined,
    deliveryStatusCode: row.delivery_status_code ?? undefined,
    paymentStatus: row.payment_status ?? undefined,
    deliverer: row.deliverer ?? undefined,
    delivererPhone: row.deliverer_phone ?? undefined,
    deliveryDate: row.delivery_date ?? undefined,
    parcelType: (row.parcel_type as Lead["parcelType"]) ?? "simple",
    stockItems: row.stock_items ?? undefined,
    customerNote: row.customer_note ?? undefined,
    restockedAt: row.restocked_at ?? undefined,
    wooOrderId: row.woo_order_id ?? undefined,
    lastModifiedBy: row.last_modified_by ?? undefined,
    lastModifiedAt: row.last_modified_at ?? undefined,
  };
}

/**
 * Traduction vers les colonnes de la table.
 *
 * `undefined` signifie "ne touche pas a ce champ", `null` signifie
 * "efface-le". La distinction compte : elle seule permet de retirer une
 * erreur transporteur devenue caduque.
 *
 * Exportee pour etre testee : cette regle est trop facile a casser par
 * inadvertance pour rester implicite.
 */
export function toRow(lead: Partial<Lead>): Partial<LeadRow> {
  const row: Partial<LeadRow> = {};
  if (lead.reference !== undefined) row.reference = lead.reference;
  if (lead.productLabel !== undefined) row.product_label = lead.productLabel;
  if (lead.productName !== undefined) row.product_name = lead.productName;
  if (lead.itemCount !== undefined) row.item_count = lead.itemCount ?? null;
  if (lead.client !== undefined) row.client = lead.client;
  if (lead.phone !== undefined) row.phone = lead.phone;
  if (lead.source !== undefined) row.source = lead.source;
  if (lead.assignedTo !== undefined) row.assigned_to = lead.assignedTo;
  if (lead.amount !== undefined) row.amount = lead.amount;
  if (lead.status !== undefined) row.status = lead.status;
  if (lead.shipping !== undefined) row.shipping = lead.shipping;
  if (lead.date !== undefined) row.date = lead.date;
  if (lead.ville !== undefined) row.ville = lead.ville ?? null;
  if (lead.tarif !== undefined) row.tarif = lead.tarif ?? null;
  if (lead.quartier !== undefined) row.quartier = lead.quartier ?? null;
  if (lead.adresse !== undefined) row.adresse = lead.adresse ?? null;
  if (lead.trackingNumber !== undefined)
    row.tracking_number = lead.trackingNumber ?? null;
  if (lead.trackingError !== undefined)
    row.tracking_error = lead.trackingError ?? null;
  if (lead.deliveryStatus !== undefined)
    row.delivery_status = lead.deliveryStatus ?? null;
  if (lead.deliveryStatusCode !== undefined)
    row.delivery_status_code = lead.deliveryStatusCode ?? null;
  if (lead.paymentStatus !== undefined)
    row.payment_status = lead.paymentStatus ?? null;
  if (lead.deliverer !== undefined) row.deliverer = lead.deliverer || null;
  if (lead.delivererPhone !== undefined)
    row.deliverer_phone = lead.delivererPhone || null;
  if (lead.deliveryDate !== undefined)
    row.delivery_date = lead.deliveryDate || null;
  if (lead.parcelType !== undefined) row.parcel_type = lead.parcelType;
  if (lead.stockItems !== undefined) row.stock_items = lead.stockItems ?? null;
  if (lead.customerNote !== undefined)
    row.customer_note = lead.customerNote || null;
  if (lead.restockedAt !== undefined)
    row.restocked_at = lead.restockedAt || null;
  if (lead.wooOrderId !== undefined) row.woo_order_id = lead.wooOrderId ?? null;
  return row;
}

const COLUMNS =
  "id,reference,product_label,product_name,item_count,client,phone,source,assigned_to,amount,status,shipping,date,ville,tarif,quartier,adresse,tracking_number,tracking_error,delivery_status,delivery_status_code,payment_status,deliverer,deliverer_phone,delivery_date,parcel_type,stock_items,customer_note,restocked_at,woo_order_id,last_modified_by,last_modified_at";

export async function listLeads(): Promise<Lead[]> {
  const supabase = getSupabaseServerClient();
  // `id` departage les `created_at` identiques : sans lui, deux lignes de
  // meme horodatage ressortent dans un ordre arbitraire, et une ligne
  // modifiee (reecrite en fin de table) se retrouve affichee en dernier.
  // Lecture complete : une lecture simple s'arrete a mille lignes sans
  // le dire, et les commandes au-dela disparaitraient de la liste.
  const data = await fetchAll<LeadRow>(() =>
    supabase
      .from("leads")
      .select(COLUMNS)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
  );

  const leads = await withProductImages(data.map(toLead));
  return withCityTariffs(leads);
}

/**
 * Attache a chaque commande la photo de son produit.
 *
 * Le rapprochement se fait d'abord par code article preleve, qui est
 * exact, puis par nom : une commande de la boutique porte le nom exact
 * du produit, puisque les deux viennent de la meme source.
 */
export async function leadProductImage(id: string): Promise<string | null> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("leads")
    .select("product_name,stock_items")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  // Le rapprochement nom/reference est deja ecrit : on le rejoue sur une
  // seule commande plutot que d'en faire une deuxieme version.
  const [resolu] = await withProductImages([
    {
      productName: data.product_name ?? "",
      stockItems: data.stock_items ?? undefined,
    } as Lead,
  ]);
  return resolu?.productImage ?? null;
}

async function withProductImages(leads: Lead[]): Promise<Lead[]> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("products")
    .select("name,image,forcelog_ref")
    .not("image", "is", null);

  const rows = (data ?? []) as {
    name: string;
    image: string;
    forcelog_ref: string | null;
  }[];
  if (rows.length === 0) return leads;

  const byRef = new Map(
    rows.filter((r) => r.forcelog_ref).map((r) => [r.forcelog_ref as string, r.image])
  );
  const byName = new Map(rows.map((r) => [r.name.trim().toLowerCase(), r.image]));

  return leads.map((lead) => {
    // "180ZEI:2,18BWTD:1" : la photo du premier article preleve.
    const firstRef = lead.stockItems?.split(",")[0]?.split(":")[0]?.trim();
    const image =
      (firstRef && byRef.get(firstRef)) ||
      byName.get(lead.productName.trim().toLowerCase());
    return image ? { ...lead, productImage: image } : lead;
  });
}

/**
 * Complete le tarif des commandes qui n'en portent pas, avec celui de
 * leur ville dans le dictionnaire.
 *
 * Seules les commandes sans tarif sont concernees : un tarif deja
 * enregistre est celui qui a ete facture au client, le remplacer par le
 * prix du jour reecrirait l'histoire de la commande.
 */
async function withCityTariffs(leads: Lead[]): Promise<Lead[]> {
  if (!leads.some((l) => !l.tarif && l.ville)) return leads;

  let tariffs: Map<string, number>;
  try {
    tariffs = await tariffByCityForm();
  } catch {
    // Dictionnaire indisponible : afficher les commandes sans tarif vaut
    // mieux que ne pas les afficher du tout.
    return leads;
  }

  return leads.map((lead) => {
    if (lead.tarif || !lead.ville) return lead;
    const tariff = tariffs.get(cityKey(lead.ville));
    return tariff === undefined ? lead : { ...lead, tarif: `${tariff} MAD` };
  });
}

/** Retrouve une commande par son numero de suivi ForceLog (pour le webhook). */
export async function findLeadByTrackingNumber(
  trackingNumber: string
): Promise<Lead | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("leads")
    .select(COLUMNS)
    .eq("tracking_number", trackingNumber)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toLead(data as LeadRow) : null;
}

export async function createLead(lead: Partial<Lead>): Promise<Lead> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("leads")
    .insert(toRow(lead))
    .select(COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  const cree = toLead(data as LeadRow);

  // Une commande saisie a la main previent l'exterieur comme une
  // commande venue de la boutique : c'est la meme nouvelle.
  void emit("lead.created", cree);

  return cree;
}

export async function updateLead(
  id: string,
  changes: Partial<Lead>
): Promise<Lead> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("leads")
    .update(toRow(changes))
    .eq("id", id)
    .select(COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return toLead(data as LeadRow);
}

export async function updateLeads(
  ids: string[],
  changes: Partial<Lead>
): Promise<Lead[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("leads")
    .update(toRow(changes))
    .in("id", ids)
    .select(COLUMNS);

  if (error) throw new Error(error.message);
  return (data as LeadRow[]).map(toLead);
}

export async function deleteLead(id: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
