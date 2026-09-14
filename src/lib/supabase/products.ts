import { getSupabaseServerClient } from "./server";

/**
 * Catalogue produits.
 *
 * Le catalogue appartient a l'application : un produit s'y cree et s'y
 * modifie a la main. Le stock ForceLog peut toujours y etre verse, mais
 * seulement sur demande explicite, et sans jamais ecraser les champs
 * commerciaux d'un produit deja saisi.
 *
 * `ref` est la reference du produit. Pour un produit venu du
 * transporteur c'est son code article, celui qu'on transmet dans le champ
 * STOCK d'un colis de stock, d'ou son unicite en base.
 */

export type ProductSource = "manuel" | "forcelog";

export type StockProduct = {
  id: string;
  ref: string;
  name: string;
  productName: string;
  barcode?: string;
  /** Code article chez le transporteur, genere par lui. */
  forcelogRef?: string;
  /** SKU de la boutique WooCommerce. */
  wooSku?: string;
  quantity: number;
  waitingQuantity: number;
  image?: string;
  supplier?: string;
  priceSale: number;
  costSupplier: number;
  reorderThreshold: number;
  status: "Actif" | "Archive";
  source: ProductSource;
  updatedAt?: string;
};

type ProductRow = {
  id: string;
  ref: string;
  name: string;
  product_name: string | null;
  barcode: string | null;
  forcelog_ref: string | null;
  woo_sku: string | null;
  quantity: number;
  waiting_quantity: number;
  image: string | null;
  supplier: string | null;
  price_sale: number | string;
  cost_supplier: number | string;
  reorder_threshold: number;
  status: string;
  source: string;
  updated_at: string | null;
};

const COLUMNS =
  "id,ref,name,product_name,barcode,forcelog_ref,woo_sku,quantity,waiting_quantity,image,supplier,price_sale,cost_supplier,reorder_threshold,status,source,updated_at";

function toProduct(row: ProductRow): StockProduct {
  return {
    id: row.id,
    ref: row.ref,
    name: row.name,
    productName: row.product_name ?? row.name,
    barcode: row.barcode ?? undefined,
    forcelogRef: row.forcelog_ref ?? undefined,
    wooSku: row.woo_sku ?? undefined,
    quantity: row.quantity,
    waitingQuantity: row.waiting_quantity,
    image: row.image ?? undefined,
    supplier: row.supplier ?? undefined,
    priceSale: Number(row.price_sale),
    costSupplier: Number(row.cost_supplier),
    reorderThreshold: row.reorder_threshold,
    status: row.status === "Archive" ? "Archive" : "Actif",
    source: row.source === "forcelog" ? "forcelog" : "manuel",
    updatedAt: row.updated_at ?? undefined,
  };
}

export type ProductInput = {
  ref: string;
  name: string;
  productName?: string;
  barcode?: string;
  forcelogRef?: string;
  wooSku?: string;
  supplier?: string;
  priceSale?: number;
  costSupplier?: number;
  quantity?: number;
  waitingQuantity?: number;
  reorderThreshold?: number;
  status?: "Actif" | "Archive";
  image?: string;
};

function toRow(input: Partial<ProductInput>) {
  const row: Record<string, unknown> = {};
  if (input.ref !== undefined) row.ref = input.ref.trim();
  if (input.name !== undefined) row.name = input.name.trim();
  if (input.productName !== undefined) row.product_name = input.productName || null;
  if (input.barcode !== undefined) row.barcode = input.barcode || null;
  if (input.forcelogRef !== undefined) row.forcelog_ref = input.forcelogRef || null;
  if (input.wooSku !== undefined) row.woo_sku = input.wooSku || null;
  if (input.supplier !== undefined) row.supplier = input.supplier || null;
  if (input.priceSale !== undefined) row.price_sale = input.priceSale;
  if (input.costSupplier !== undefined) row.cost_supplier = input.costSupplier;
  if (input.quantity !== undefined) row.quantity = input.quantity;
  if (input.waitingQuantity !== undefined) row.waiting_quantity = input.waitingQuantity;
  if (input.reorderThreshold !== undefined)
    row.reorder_threshold = input.reorderThreshold;
  if (input.status !== undefined) row.status = input.status;
  if (input.image !== undefined) row.image = input.image || null;
  return row;
}

export async function listProducts(): Promise<StockProduct[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select(COLUMNS)
    .order("quantity", { ascending: false })
    .order("ref", { ascending: true });

  if (error) throw new Error(error.message);
  return (data as ProductRow[]).map(toProduct);
}

export async function createProduct(input: ProductInput): Promise<StockProduct> {
  if (!input.name?.trim()) throw new Error("Le nom du produit est requis.");
  if (!input.ref?.trim()) throw new Error("La reference (SKU) est requise.");

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .insert({ ...toRow(input), source: "manuel" })
    .select(COLUMNS)
    .single();

  if (error) {
    throw new Error(
      error.code === "23505"
        ? "Une reference est deja utilisee par un autre produit (interne, ForceLog ou WooCommerce)."
        : error.message
    );
  }
  return toProduct(data as ProductRow);
}

export async function updateProduct(
  id: string,
  changes: Partial<ProductInput>
): Promise<StockProduct> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .update(toRow(changes))
    .eq("id", id)
    .select(COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return toProduct(data as ProductRow);
}

export async function deleteProduct(id: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Verse l'etat du stock ForceLog dans le catalogue, sur demande.
 *
 * Ne touche qu'aux champs que le transporteur connait : quantites, nom,
 * code-barres. Prix, cout, fournisseur et seuil restent ceux saisis dans
 * l'application, sans quoi un import effacerait le travail commercial.
 */
export async function syncProductsFromStock(
  items: Array<{
    ref: string;
    name: string;
    productName: string;
    barcode?: string | null;
    quantity: number;
    waitingQuantity: number;
    image?: string | null;
  }>
): Promise<number> {
  if (items.length === 0) return 0;

  const supabase = getSupabaseServerClient();
  const { data: existing } = await supabase.from("products").select("id,ref");
  const byRef = new Map(
    ((existing ?? []) as { id: string; ref: string }[]).map((r) => [r.ref, r.id])
  );

  let touched = 0;
  for (const item of items) {
    const known = byRef.get(item.ref);
    const stockFields = {
      name: item.name,
      product_name: item.productName,
      barcode: item.barcode ?? null,
      forcelog_ref: item.ref,
      quantity: item.quantity,
      waiting_quantity: item.waitingQuantity,
      image: item.image ?? null,
    };

    const { error } = known
      ? await supabase.from("products").update(stockFields).eq("id", known)
      : await supabase
          .from("products")
          .insert({ ref: item.ref, ...stockFields, source: "forcelog" });

    if (error) throw new Error(error.message);
    touched += 1;
  }
  return touched;
}
