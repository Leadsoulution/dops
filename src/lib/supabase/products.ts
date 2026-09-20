import type { CatalogueProduct } from "@/lib/forcelog/parcel-type";
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
  /**
   * Comment ce produit part par defaut :
   * - "simple" : expedie depuis notre depot
   * - "stock"  : preleve dans le depot du transporteur
   */
  defaultParcelType: "simple" | "stock";
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
  default_parcel_type: string;
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
  "id,ref,name,product_name,barcode,forcelog_ref,woo_sku,default_parcel_type,quantity,waiting_quantity,image,supplier,price_sale,cost_supplier,reorder_threshold,status,source,updated_at";

function toProduct(row: ProductRow): StockProduct {
  return {
    id: row.id,
    ref: row.ref,
    name: row.name,
    productName: row.product_name ?? row.name,
    barcode: row.barcode ?? undefined,
    forcelogRef: row.forcelog_ref ?? undefined,
    wooSku: row.woo_sku ?? undefined,
    defaultParcelType: row.default_parcel_type === "stock" ? "stock" : "simple",
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
  defaultParcelType?: "simple" | "stock";
  supplier?: string;
  priceSale?: number;
  costSupplier?: number;
  quantity?: number;
  waitingQuantity?: number;
  reorderThreshold?: number;
  status?: "Actif" | "Archive";
  image?: string;
  /** Quantite achetee au depart, tenue dans l'inventaire. */
  stockInitial?: number;
  /** Total confie au transporteur depuis le debut. */
  stockSent?: number;
};

function toRow(input: Partial<ProductInput>) {
  const row: Record<string, unknown> = {};
  if (input.ref !== undefined) row.ref = input.ref.trim();
  if (input.name !== undefined) row.name = input.name.trim();
  if (input.productName !== undefined) row.product_name = input.productName || null;
  if (input.barcode !== undefined) row.barcode = input.barcode || null;
  if (input.forcelogRef !== undefined) row.forcelog_ref = input.forcelogRef || null;
  if (input.wooSku !== undefined) row.woo_sku = input.wooSku || null;
  if (input.defaultParcelType !== undefined) {
    row.default_parcel_type = input.defaultParcelType;
  }
  if (input.supplier !== undefined) row.supplier = input.supplier || null;
  if (input.priceSale !== undefined) row.price_sale = input.priceSale;
  if (input.costSupplier !== undefined) row.cost_supplier = input.costSupplier;
  if (input.quantity !== undefined) row.quantity = input.quantity;
  if (input.waitingQuantity !== undefined) row.waiting_quantity = input.waitingQuantity;
  if (input.reorderThreshold !== undefined)
    row.reorder_threshold = input.reorderThreshold;
  if (input.status !== undefined) row.status = input.status;
  if (input.image !== undefined) row.image = input.image || null;
  // Les deux quantites de l'inventaire. Negatif refuse : un stock
  // sous zero ne decrit rien, il cache une saisie fautive.
  if (input.stockInitial !== undefined)
    row.stock_initial = Math.max(0, Math.trunc(input.stockInitial));
  if (input.stockSent !== undefined)
    row.stock_sent = Math.max(0, Math.trunc(input.stockSent));
  return row;
}

/**
 * Le catalogue reduit a ce qui decide du type de colis. Relu a chaque
 * expedition : c'est l'etat du produit au moment de l'envoi qui compte,
 * pas celui du jour ou la commande est arrivee.
 */
export async function parcelCatalogue(): Promise<CatalogueProduct[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("name,forcelog_ref,default_parcel_type");
  if (error) throw new Error(error.message);

  return ((data ?? []) as {
    name: string;
    forcelog_ref: string | null;
    default_parcel_type: string | null;
  }[]).map((row) => ({
    name: row.name,
    forcelogRef: row.forcelog_ref ?? undefined,
    defaultParcelType: row.default_parcel_type === "stock" ? "stock" : "simple",
  }));
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

/**
 * Un colis de stock preleve un article dans le depot du transporteur :
 * sans code article, il n'y a rien a prelever.
 */
function assertStockIsShippable(input: Partial<ProductInput>) {
  if (input.defaultParcelType === "stock" && !input.forcelogRef?.trim()) {
    throw new Error(
      "Un colis de stock exige un code article ForceLog : sans lui, le transporteur ne sait pas quoi prelever."
    );
  }
}

export async function createProduct(input: ProductInput): Promise<StockProduct> {
  if (!input.name?.trim()) throw new Error("Le nom du produit est requis.");
  if (!input.ref?.trim()) throw new Error("La reference (SKU) est requise.");
  assertStockIsShippable(input);

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

  // Le code article peut ne pas faire partie de la modification : on lit
  // alors celui deja enregistre, plutot que de refuser a tort.
  if (changes.defaultParcelType === "stock" && changes.forcelogRef === undefined) {
    const { data: current } = await supabase
      .from("products")
      .select("forcelog_ref")
      .eq("id", id)
      .maybeSingle();
    assertStockIsShippable({
      defaultParcelType: "stock",
      forcelogRef: (current as { forcelog_ref: string | null } | null)?.forcelog_ref ?? "",
    });
  } else {
    assertStockIsShippable(changes);
  }

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

/**
 * Rattache les produits de la boutique au catalogue, par SKU.
 *
 * Trois cas, dans cet ordre :
 *   - un produit porte deja ce SKU boutique : rien a faire
 *   - un produit a la meme reference interne : le SKU s'y rattache
 *   - sinon le produit est ajoute au catalogue, sans code ForceLog
 *
 * Le rapprochement avec l'article du depot n'est jamais devine : deux
 * produits peuvent porter des noms proches, et se tromper enverrait le
 * mauvais colis au client. C'est une decision humaine.
 */
export async function linkWooProducts(
  items: Array<{
    sku: string;
    name: string;
    price: number;
    quantity: number;
    image?: string;
  }>
): Promise<{
  lies: number;
  ajoutes: number;
  deja: number;
  /** Photos remises a jour parce que la boutique avait change de fichier. */
  photos: number;
}> {
  if (items.length === 0)
    return { lies: 0, ajoutes: 0, deja: 0, photos: 0 };

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("id,ref,woo_sku,name,image");
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as {
    id: string;
    ref: string;
    woo_sku: string | null;
    name: string;
    image: string | null;
  }[];
  const byWooSku = new Map(rows.filter((r) => r.woo_sku).map((r) => [r.woo_sku as string, r]));
  const byRef = new Map(rows.map((r) => [r.ref.toLowerCase(), r]));

  let lies = 0;
  let ajoutes = 0;
  let deja = 0;
  let photos = 0;

  /**
   * Remet la photo a jour quand la boutique a remplace son fichier.
   *
   * Sans cela, l'adresse enregistree le jour de l'import restait la
   * seule connue : la boutique republiant ses images en .webp, quatre
   * fiches sur sept pointaient vers des adresses mortes, et la photo
   * n'apparaissait plus nulle part.
   *
   * Seule une photo de la meme origine est remplacee. Celle qui vient
   * du depot du transporteur reste en place : elle n'a pas bouge, et
   * l'ecraser ferait perdre la photo de l'article reellement expedie.
   */
  async function refreshImage(
    row: { id: string; image: string | null },
    fresh?: string
  ) {
    if (!fresh || row.image === fresh) return;
    if (row.image) {
      try {
        if (new URL(row.image).host !== new URL(fresh).host) return;
      } catch {
        // Adresse illisible : la neuve ne peut pas faire pire.
      }
    }
    const { error: imageError } = await supabase
      .from("products")
      .update({ image: fresh })
      .eq("id", row.id);
    if (imageError) throw new Error(imageError.message);
    photos += 1;
  }

  for (const item of items) {
    const lie = byWooSku.get(item.sku);
    if (lie) {
      await refreshImage(lie, item.image);
      deja += 1;
      continue;
    }

    const match = byRef.get(item.sku.toLowerCase());
    if (match) {
      const { error: linkError } = await supabase
        .from("products")
        .update({ woo_sku: item.sku })
        .eq("id", match.id);
      if (linkError) throw new Error(linkError.message);
      await refreshImage(match, item.image);
      lies += 1;
      continue;
    }

    const { error: insertError } = await supabase.from("products").insert({
      ref: item.sku,
      woo_sku: item.sku,
      name: item.name,
      product_name: item.name,
      price_sale: item.price,
      quantity: item.quantity,
      image: item.image ?? null,
      supplier: "WooCommerce",
      source: "manuel",
    });
    if (insertError) throw new Error(insertError.message);
    ajoutes += 1;
  }

  return { lies, ajoutes, deja, photos };
}

/**
 * Fusionne une fiche boutique dans la fiche du depot transporteur.
 *
 * Le catalogue se remplit par deux bouts : l'import ForceLog cree une
 * fiche par article du depot, l'import WooCommerce une fiche par produit
 * de la boutique. Le meme objet physique s'y retrouve donc deux fois,
 * une fois par code. Les relier, c'est n'en garder qu'un.
 *
 * La fiche du transporteur est gardee : c'est elle qui porte le stock
 * reel. Elle recupere le SKU boutique, et les champs commerciaux qui lui
 * manquaient. La fiche boutique disparait.
 */
export async function mergeIntoCarrierProduct(
  sourceId: string,
  forcelogRef: string
): Promise<StockProduct> {
  const supabase = getSupabaseServerClient();

  const { data: sourceRow } = await supabase
    .from("products")
    .select(COLUMNS)
    .eq("id", sourceId)
    .maybeSingle();
  const { data: targetRow } = await supabase
    .from("products")
    .select(COLUMNS)
    .eq("forcelog_ref", forcelogRef.trim())
    .maybeSingle();

  if (!sourceRow) throw new Error("Produit introuvable.");
  if (!targetRow) {
    throw new Error("Aucun produit ne porte ce code article ForceLog.");
  }

  const source = toProduct(sourceRow as ProductRow);
  const target = toProduct(targetRow as ProductRow);
  if (source.id === target.id) return target;

  // La fiche boutique disparaissant, son SKU doit etre libere avant
  // d'etre repose sur l'autre : il est unique en base.
  const { error: clearError } = await supabase
    .from("products")
    .delete()
    .eq("id", source.id);
  if (clearError) throw new Error(clearError.message);

  const { data, error } = await supabase
    .from("products")
    .update({
      woo_sku: source.wooSku ?? target.wooSku ?? null,
      // On ne remplace que ce qui manquait : le travail deja saisi sur la
      // fiche transporteur prime.
      price_sale: target.priceSale || source.priceSale,
      cost_supplier: target.costSupplier || source.costSupplier,
      image: target.image ?? source.image ?? null,
      default_parcel_type: "stock",
    })
    .eq("id", target.id)
    .select(COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return toProduct(data as ProductRow);
}

/** Produit portant deja ce code article, s'il y en a un. */
export async function findByForcelogRef(
  forcelogRef: string,
  exceptId?: string
): Promise<StockProduct | null> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("products")
    .select(COLUMNS)
    .eq("forcelog_ref", forcelogRef.trim())
    .maybeSingle();
  if (!data) return null;
  const product = toProduct(data as ProductRow);
  return product.id === exceptId ? null : product;
}
