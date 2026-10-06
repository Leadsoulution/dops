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
  /** Ce qu'il fournit : bijoux, textile, emballage. */
  category?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  city?: string;
  address?: string;
  /** Identifiant commun de l'entreprise, pour les factures. */
  ice?: string;
  /** Releve d'identite bancaire, pour les virements. */
  rib?: string;
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
  category: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  address: string | null;
  ice: string | null;
  rib: string | null;
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
      .select("id,name,category,contact_name,phone,email,city,address,ice,rib,note,is_active")
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
      category: row.category ?? undefined,
      contactName: row.contact_name ?? undefined,
      phone: row.phone ?? undefined,
      email: row.email ?? undefined,
      city: row.city ?? undefined,
      address: row.address ?? undefined,
      ice: row.ice ?? undefined,
      rib: row.rib ?? undefined,
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
    category: input.category?.trim() || null,
    address: input.address?.trim() || null,
    ice: input.ice?.trim() || null,
    rib: input.rib?.trim() || null,
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
      category: input.category?.trim() || null,
      address: input.address?.trim() || null,
      ice: input.ice?.trim() || null,
      rib: input.rib?.trim() || null,
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

/**
 * Un arrivage : une date, et les produits recus ce jour-la.
 *
 * L'en-tete porte la date et la reference, les lignes portent les
 * produits. Sans en-tete, deux arrivages du meme fournisseur le meme
 * jour seraient impossibles a distinguer.
 *
 * Le total ne se saisit pas, il s'additionne. Un total ecrit a la main
 * qui ne correspond pas a ses lignes est un total faux qu'on decouvre
 * six mois plus tard.
 */
export type ArrivalLine = {
  productId: string;
  productName?: string;
  quantity: number;
  unitCost: number;
  totalMad: number;
};

export type Arrival = {
  id: string;
  supplierId: string;
  arrivedAt: string;
  reference?: string;
  note?: string;
  lines: ArrivalLine[];
  /** Somme des lignes, en dirhams. */
  totalMad: number;
  units: number;
};

export async function listArrivals(supplierId?: string): Promise<Arrival[]> {
  const supabase = getSupabaseServerClient();

  let entetes = supabase
    .from("supplier_arrivals")
    .select("id,supplier_id,arrived_at,reference,note")
    .order("arrived_at", { ascending: false });
  if (supplierId) entetes = entetes.eq("supplier_id", supplierId);

  const [{ data: têtes, error }, lignes, produits] = await Promise.all([
    entetes,
    supplierId
      ? supabase
          .from("supplier_purchases")
          .select("arrival_id,product_id,quantity,unit_cost,total_mad")
          .eq("supplier_id", supplierId)
      : supabase
          .from("supplier_purchases")
          .select("arrival_id,product_id,quantity,unit_cost,total_mad"),
    supabase.from("products").select("id,name"),
  ]);
  if (error) throw new Error(error.message);

  const noms = new Map(
    ((produits.data ?? []) as { id: string; name: string }[]).map((p) => [
      p.id,
      p.name,
    ])
  );

  const parArrivage = new Map<string, ArrivalLine[]>();
  for (const l of (lignes.data ?? []) as unknown as {
    arrival_id: string | null;
    product_id: string;
    quantity: number;
    unit_cost: string | number;
    total_mad: string | number;
  }[]) {
    if (!l.arrival_id) continue;
    const liste = parArrivage.get(l.arrival_id) ?? [];
    liste.push({
      productId: l.product_id,
      productName: noms.get(l.product_id),
      quantity: l.quantity,
      unitCost: nombre(l.unit_cost),
      totalMad: nombre(l.total_mad),
    });
    parArrivage.set(l.arrival_id, liste);
  }

  return ((têtes ?? []) as unknown as {
    id: string;
    supplier_id: string;
    arrived_at: string;
    reference: string | null;
    note: string | null;
  }[]).map((t) => {
    const lines = parArrivage.get(t.id) ?? [];
    return {
      id: t.id,
      supplierId: t.supplier_id,
      arrivedAt: t.arrived_at,
      reference: t.reference ?? undefined,
      note: t.note ?? undefined,
      lines,
      totalMad:
        Math.round(lines.reduce((s, l) => s + l.totalMad, 0) * 100) / 100,
      units: lines.reduce((s, l) => s + l.quantity, 0),
    };
  });
}

/**
 * Enregistre un arrivage et ses lignes.
 *
 * L'en-tete part d'abord, puisque les lignes le referencent. Si leur
 * ecriture echoue, l'en-tete est retire : un arrivage sans ligne
 * n'apprend rien et viendrait polluer la liste. C'est le seul endroit
 * ou ce module efface quelque chose, et il n'efface que ce qu'il
 * venait de creer.
 *
 * La quantite en stock des produits n'est pas touchee : l'arrivage
 * renseigne le cout et le solde du fournisseur, l'inventaire se gere
 * ailleurs.
 */
export async function createArrival(
  input: {
    supplierId: string;
    arrivedAt: string;
    reference?: string;
    note?: string;
    lines: { productId: string; quantity: number; unitCost: number }[];
  },
  userId?: string
): Promise<void> {
  const supabase = getSupabaseServerClient();

  const { data: tete, error: erreurTete } = await supabase
    .from("supplier_arrivals")
    .insert({
      supplier_id: input.supplierId,
      arrived_at: input.arrivedAt,
      reference: input.reference?.trim() || null,
      note: input.note?.trim() || null,
      ...(userId ? { created_by: userId } : {}),
    })
    .select("id")
    .single();
  if (erreurTete) throw new Error(erreurTete.message);

  const arrivalId = (tete as unknown as { id: string }).id;

  const { error } = await supabase.from("supplier_purchases").insert(
    input.lines.map((l) => ({
      supplier_id: input.supplierId,
      arrival_id: arrivalId,
      product_id: l.productId,
      quantity: l.quantity,
      unit_cost: l.unitCost,
      currency: "MAD",
      exchange_rate: 1,
      unit_cost_mad: l.unitCost,
      total_mad: Math.round(l.unitCost * l.quantity * 100) / 100,
      purchased_at: input.arrivedAt,
      invoice_ref: input.reference?.trim() || null,
      ...(userId ? { created_by: userId } : {}),
    }))
  );

  if (error) {
    await supabase.from("supplier_arrivals").delete().eq("id", arrivalId);
    throw new Error(error.message);
  }
}
