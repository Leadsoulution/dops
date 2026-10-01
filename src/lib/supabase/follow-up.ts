import "server-only";
import { getSupabaseServerClient } from "./server";
import { fetchAll } from "./page";
import {
  daysSince,
  isLate,
  needsConfirmationFollowUp,
  needsDeliveryFollowUp,
  type FollowUpKind,
} from "@/lib/follow-up";

/**
 * Les deux files de relance, pretes a afficher.
 *
 * Le tri met les dossiers les plus anciens en tete : c'est celui qui
 * attend depuis douze jours qu'il faut appeler, pas celui d'hier. Une
 * liste rangee par date de commande aurait enterre les premiers sous
 * les seconds.
 */

export type FollowUpLead = {
  id: string;
  reference: string;
  client: string;
  phone: string;
  ville?: string;
  quartier?: string;
  adresse?: string;
  productName: string;
  productLabel: string;
  productImage?: string;
  itemCount: number;
  amount: string;
  /** Statut de confirmation, ou libelle du transporteur selon la file. */
  status: string;
  /** Date de creation, telle qu'affichee partout ailleurs. */
  date: string;
  source: string;
  note?: string;
  trackingNumber?: string;
  deliverer?: string;
  delivererPhone?: string;
  /** Derniere action connue sur la commande, en ISO. */
  lastActionAt: string;
  /** Jours ecoules depuis cette action. */
  daysWaiting: number;
  /** Au-dela du seuil de sa file. */
  late: boolean;
};

type Row = {
  id: string;
  reference: string;
  client: string;
  phone: string;
  ville: string | null;
  quartier: string | null;
  adresse: string | null;
  product_name: string | null;
  product_label: string | null;
  item_count: number | null;
  amount: string | null;
  status: string;
  date: string | null;
  source: string | null;
  customer_note: string | null;
  tracking_number: string | null;
  delivery_status: string | null;
  delivery_status_code: string | null;
  deliverer: string | null;
  deliverer_phone: string | null;
  created_at: string;
  last_modified_at: string | null;
};

const CHAMPS =
  "id,reference,client,phone,ville,quartier,adresse,product_name," +
  "product_label,item_count,amount,status,date,source,customer_note," +
  "tracking_number,delivery_status,delivery_status_code,deliverer," +
  "deliverer_phone,created_at,last_modified_at";

export async function getFollowUps(): Promise<{
  confirmation: FollowUpLead[];
  livraison: FollowUpLead[];
}> {
  const supabase = getSupabaseServerClient();

  const [rows, produits] = await Promise.all([
    fetchAll<Row>(() => supabase.from("leads").select(CHAMPS)),
    supabase.from("products").select("name,image").not("image", "is", null),
  ]);

  const imageParNom = new Map(
    ((produits.data ?? []) as { name: string; image: string }[]).map((p) => [
      p.name.trim().toLowerCase(),
      p.image,
    ])
  );

  const maintenant = new Date();

  const build = (row: Row, kind: FollowUpKind): FollowUpLead => {
    /*
     * La date de reference est la derniere action connue, pas la
     * creation : une commande rappelee hier n'attend pas depuis trois
     * semaines, meme si elle a ete passee il y a trois semaines.
     */
    const lastActionAt = row.last_modified_at ?? row.created_at;
    const daysWaiting = daysSince(lastActionAt, maintenant);

    return {
      id: row.id,
      reference: row.reference,
      client: row.client,
      phone: row.phone,
      ville: row.ville ?? undefined,
      quartier: row.quartier ?? undefined,
      adresse: row.adresse ?? undefined,
      productName: row.product_name ?? "",
      productLabel: row.product_label ?? "",
      productImage: imageParNom.get((row.product_name ?? "").trim().toLowerCase()),
      itemCount: row.item_count ?? 1,
      amount: row.amount ?? "",
      status:
        kind === "confirmation"
          ? row.status
          : (row.delivery_status ?? row.delivery_status_code ?? ""),
      date: row.date ?? "",
      source: row.source ?? "",
      note: row.customer_note?.trim() || undefined,
      trackingNumber: row.tracking_number ?? undefined,
      deliverer: row.deliverer ?? undefined,
      delivererPhone: row.deliverer_phone ?? undefined,
      lastActionAt,
      daysWaiting,
      late: isLate(kind, daysWaiting),
    };
  };

  const confirmation: FollowUpLead[] = [];
  const livraison: FollowUpLead[] = [];

  for (const row of rows) {
    /*
     * Un colis parti ne se rappelle plus pour etre confirme : c'est la
     * file livraison qui s'en occupe. Sans cette garde, une commande au
     * statut "+3 jours" expediee depuis apparaitrait dans les deux.
     */
    if (row.tracking_number && needsDeliveryFollowUp(row.delivery_status_code)) {
      livraison.push(build(row, "livraison"));
      continue;
    }
    if (!row.tracking_number && needsConfirmationFollowUp(row.status)) {
      confirmation.push(build(row, "confirmation"));
    }
  }

  const parAnciennete = (a: FollowUpLead, b: FollowUpLead) =>
    b.daysWaiting - a.daysWaiting;

  return {
    confirmation: confirmation.sort(parAnciennete),
    livraison: livraison.sort(parAnciennete),
  };
}
