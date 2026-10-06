import "server-only";
import { getSupabaseServerClient } from "./server";

/**
 * Les fournisseurs, leurs achats et leurs reglements.
 *
 * Trois choses distinctes, et c'est volontaire. Un achat engage de la
 * marchandise, un reglement sort de l'argent, et les deux ne tombent
 * presque jamais le meme jour. L'ancienne maquette les melangeait dans
 * une colonne "paye", d'ou l'impossibilite de dire ce qu'on devait
 * encore.
 *
 * Le solde se lit donc : achats moins reglements.
 */

export type Supplier = {
  id: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  city?: string;
  note?: string;
  isActive: boolean;
  /** Nombre de produits distincts achetes chez lui. */
  productsCount: number;
  /** Unites achetees, toutes references confondues. */
  unitsSupplied: number;
  /** Total des achats, en dirhams. */
  purchased: number;
  /** Total des reglements, en dirhams. */
  paid: number;
  /** Achats moins reglements. Positif : on lui doit encore. */
  balanceDue: number;
  /** Date du dernier achat, pour trier ce qui est vivant. */
  lastPurchaseAt?: string;
};

export type SupplierPurchase = {
  id: string;
  supplierId: string;
  supplierName?: string;
  productId: string;
  productName?: string;
  quantity: number;
  unitCost: number;
  currency: string;
  exchangeRate: number;
  unitCostMad: number;
  totalMad: number;
  purchasedAt: string;
  invoiceRef?: string;
  note?: string;
};

export type SupplierPayment = {
  id: string;
  supplierId: string;
  amount: number;
  currency: string;
  exchangeRate: number;
  amountMad: number;
  paidAt: string;
  method?: string;
  note?: string;
};

const nombre = (v: unknown) => Number(v) || 0;

/** Le montant en dirhams, fige avec la ligne qui le porte. */
export function toMad(amount: number, rate: number): number {
  return Math.round(amount * rate * 100) / 100;
}

type SupplierRow = {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  note: string | null;
  is_active: boolean;
};

type PurchaseRow = {
  id: string;
  supplier_id: string;
  product_id: string;
  quantity: number;
  unit_cost: string | number;
  currency: string;
  exchange_rate: string | number;
  unit_cost_mad: string | number;
  total_mad: string | number;
  purchased_at: string;
  invoice_ref: string | null;
  note: string | null;
};

type PaymentRow = {
  id: string;
  supplier_id: string;
  amount: string | number;
  currency: string;
  exchange_rate: string | number;
  amount_mad: string | number;
  paid_at: string;
  method: string | null;
  note: string | null;
};

/**
 * Les fournisseurs avec leurs totaux.
 *
 * Les trois tables sont lues d'un coup puis rapprochees en memoire :
 * a l'echelle d'un atelier, quelques centaines de lignes suffisent, et
 * une requete par fournisseur aurait coute plus cher que tout lire.
 */
export async function listSuppliers(): Promise<Supplier[]> {
  const supabase = getSupabaseServerClient();

  const [f, a, r] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id,name,contact_name,phone,email,city,note,is_active")
      .order("name"),
    supabase
      .from("supplier_purchases")
      .select("supplier_id,product_id,quantity,total_mad,purchased_at"),
    supabase.from("supplier_payments").select("supplier_id,amount_mad"),
  ]);

  const achats = (a.data ?? []) as unknown as {
    supplier_id: string;
    product_id: string;
    quantity: number;
    total_mad: string | number;
    purchased_at: string;
  }[];
  const reglements = (r.data ?? []) as unknown as {
    supplier_id: string;
    amount_mad: string | number;
  }[];

  const parFournisseur = new Map<
    string,
    { produits: Set<string>; unites: number; achete: number; dernier?: string }
  >();
  for (const x of achats) {
    const e =
      parFournisseur.get(x.supplier_id) ??
      { produits: new Set<string>(), unites: 0, achete: 0 };
    e.produits.add(x.product_id);
    e.unites += x.quantity;
    e.achete += nombre(x.total_mad);
    if (!e.dernier || x.purchased_at > e.dernier) e.dernier = x.purchased_at;
    parFournisseur.set(x.supplier_id, e);
  }

  const payes = new Map<string, number>();
  for (const x of reglements) {
    payes.set(x.supplier_id, (payes.get(x.supplier_id) ?? 0) + nombre(x.amount_mad));
  }

  return ((f.data ?? []) as unknown as SupplierRow[]).map((row) => {
    const e = parFournisseur.get(row.id);
    const purchased = Math.round((e?.achete ?? 0) * 100) / 100;
    const paid = Math.round((payes.get(row.id) ?? 0) * 100) / 100;
    return {
      id: row.id,
      name: row.name,
      contactName: row.contact_name ?? undefined,
      phone: row.phone ?? undefined,
      email: row.email ?? undefined,
      city: row.city ?? undefined,
      note: row.note ?? undefined,
      isActive: row.is_active,
      productsCount: e?.produits.size ?? 0,
      unitsSupplied: e?.unites ?? 0,
      purchased,
      paid,
      balanceDue: Math.round((purchased - paid) * 100) / 100,
      lastPurchaseAt: e?.dernier,
    };
  });
}

export async function createSupplier(
  input: Partial<Supplier>,
  userId?: string
): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("suppliers").insert({
    name: (input.name ?? "").trim(),
    contact_name: input.contactName?.trim() || null,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    city: input.city?.trim() || null,
    note: input.note?.trim() || null,
    is_active: input.isActive ?? true,
    ...(userId ? { created_by: userId } : {}),
  });
  if (error) throw new Error(error.message);
}

export async function updateSupplier(
  id: string,
  input: Partial<Supplier>
): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("suppliers")
    .update({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      contact_name: input.contactName?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      city: input.city?.trim() || null,
      note: input.note?.trim() || null,
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Les achats d'un fournisseur, ou tous, du plus recent au plus ancien. */
export async function listPurchases(
  supplierId?: string
): Promise<SupplierPurchase[]> {
  const supabase = getSupabaseServerClient();
  let q = supabase
    .from("supplier_purchases")
    .select(
      "id,supplier_id,product_id,quantity,unit_cost,currency,exchange_rate," +
        "unit_cost_mad,total_mad,purchased_at,invoice_ref,note"
    )
    .order("purchased_at", { ascending: false });
  if (supplierId) q = q.eq("supplier_id", supplierId);

  const [{ data, error }, produits] = await Promise.all([
    q,
    supabase.from("products").select("id,name"),
  ]);
  if (error) throw new Error(error.message);

  const noms = new Map(
    ((produits.data ?? []) as { id: string; name: string }[]).map((p) => [
      p.id,
      p.name,
    ])
  );

  return ((data ?? []) as unknown as PurchaseRow[]).map((row) => ({
    id: row.id,
    supplierId: row.supplier_id,
    productId: row.product_id,
    productName: noms.get(row.product_id),
    quantity: row.quantity,
    unitCost: nombre(row.unit_cost),
    currency: row.currency,
    exchangeRate: nombre(row.exchange_rate),
    unitCostMad: nombre(row.unit_cost_mad),
    totalMad: nombre(row.total_mad),
    purchasedAt: row.purchased_at,
    invoiceRef: row.invoice_ref ?? undefined,
    note: row.note ?? undefined,
  }));
}

export async function createPurchase(
  input: {
    supplierId: string;
    productId: string;
    quantity: number;
    unitCost: number;
    currency?: string;
    exchangeRate?: number;
    purchasedAt: string;
    invoiceRef?: string;
    note?: string;
  },
  userId?: string
): Promise<void> {
  const supabase = getSupabaseServerClient();
  const currency = input.currency ?? "MAD";
  const rate = currency === "MAD" ? 1 : (input.exchangeRate ?? 1);
  const unitMad = toMad(input.unitCost, rate);

  const { error } = await supabase.from("supplier_purchases").insert({
    supplier_id: input.supplierId,
    product_id: input.productId,
    quantity: input.quantity,
    unit_cost: input.unitCost,
    currency,
    exchange_rate: rate,
    unit_cost_mad: unitMad,
    // Le total se calcule ici, pas dans le navigateur : c'est lui qui
    // fait le solde du fournisseur.
    total_mad: Math.round(unitMad * input.quantity * 100) / 100,
    purchased_at: input.purchasedAt,
    invoice_ref: input.invoiceRef?.trim() || null,
    note: input.note?.trim() || null,
    ...(userId ? { created_by: userId } : {}),
  });
  if (error) throw new Error(error.message);
}

export async function listPayments(
  supplierId?: string
): Promise<SupplierPayment[]> {
  const supabase = getSupabaseServerClient();
  let q = supabase
    .from("supplier_payments")
    .select(
      "id,supplier_id,amount,currency,exchange_rate,amount_mad,paid_at,method,note"
    )
    .order("paid_at", { ascending: false });
  if (supplierId) q = q.eq("supplier_id", supplierId);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as PaymentRow[]).map((row) => ({
    id: row.id,
    supplierId: row.supplier_id,
    amount: nombre(row.amount),
    currency: row.currency,
    exchangeRate: nombre(row.exchange_rate),
    amountMad: nombre(row.amount_mad),
    paidAt: row.paid_at,
    method: row.method ?? undefined,
    note: row.note ?? undefined,
  }));
}

export async function createPayment(
  input: {
    supplierId: string;
    amount: number;
    currency?: string;
    exchangeRate?: number;
    paidAt: string;
    method?: string;
    note?: string;
  },
  userId?: string
): Promise<void> {
  const supabase = getSupabaseServerClient();
  const currency = input.currency ?? "MAD";
  const rate = currency === "MAD" ? 1 : (input.exchangeRate ?? 1);

  const { error } = await supabase.from("supplier_payments").insert({
    supplier_id: input.supplierId,
    amount: input.amount,
    currency,
    exchange_rate: rate,
    amount_mad: toMad(input.amount, rate),
    paid_at: input.paidAt,
    method: input.method?.trim() || null,
    note: input.note?.trim() || null,
    ...(userId ? { created_by: userId } : {}),
  });
  if (error) throw new Error(error.message);
}

/**
 * Le cout moyen pondere de chaque produit, par identifiant.
 *
 * Somme payee divisee par unites recues : deux cents pieces a dix
 * dirhams puis cent a seize ne font pas treize, elles font douze. La
 * moyenne simple surevaluerait le petit lot.
 *
 * Un produit sans achat enregistre n'y figure pas — c'est alors le
 * cout saisi sur sa fiche qui sert, et c'est voulu : la migration ne
 * doit pas ramener tous les couts a zero.
 */
export async function weightedCosts(): Promise<Map<string, number>> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("supplier_purchases")
    .select("product_id,quantity,unit_cost_mad");

  const cumul = new Map<string, { unites: number; paye: number }>();
  for (const row of (data ?? []) as unknown as {
    product_id: string;
    quantity: number;
    unit_cost_mad: string | number;
  }[]) {
    const e = cumul.get(row.product_id) ?? { unites: 0, paye: 0 };
    e.unites += row.quantity;
    e.paye += nombre(row.unit_cost_mad) * row.quantity;
    cumul.set(row.product_id, e);
  }

  const moyennes = new Map<string, number>();
  for (const [id, e] of cumul) {
    if (e.unites > 0) {
      moyennes.set(id, Math.round((e.paye / e.unites) * 100) / 100);
    }
  }
  return moyennes;
}
