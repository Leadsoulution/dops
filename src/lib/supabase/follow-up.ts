import "server-only";
import { getSupabaseServerClient } from "./server";
import { fetchAll } from "./page";
import {
  daysSince,
  followUpState,
  isLate,
  needsConfirmationFollowUp,
  needsDeliveryFollowUp,
  type FollowUpKind,
} from "@/lib/follow-up";

/**
 * Les files de relance, pretes a afficher.
 *
 * Le tri met les dossiers les plus anciens en tete : c'est celui qui
 * attend depuis douze jours qu'il faut appeler, pas celui d'hier. Une
 * liste rangee par date de commande aurait enterre les premiers sous
 * les seconds.
 *
 * L'avancement appartient a l'agent, pas a la commande. Chacun traite
 * la meme commande de son cote : Centrecall peut en etre a son
 * deuxieme passage quand Sanaa n'a encore rien marque, et ce que l'une
 * met de cote reste du a l'autre. Un compteur unique par commande
 * aurait fait disparaitre un dossier de la liste de tout le monde des
 * qu'une seule personne y avait touche.
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
  /*
   * Les deux statuts bruts, en plus de celui qu'on affiche. Ce sont
   * eux qui choisissent le modele de message WhatsApp, exactement
   * comme dans la fiche d'appel : l'etiquette lisible ne suffit pas a
   * retrouver la cle.
   */
  confirmationStatus: string;
  deliveryStatusCode?: string;
  deliveryDate?: string;
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
  /** Sa file d'origine : l'onglet Traite melange les deux. */
  kind: FollowUpKind;
  /** Nombre de marquages deja poses, de 0 a 3. */
  followUpCount: number;
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
  delivery_date: string | null;
  created_at: string;
  last_modified_at: string | null;
};

/** L'avancement d'un agent sur une commande. */
type SuiviRow = {
  lead_id: string;
  count: number | null;
  marked_at: string | null;
};

const CHAMPS =
  "id,reference,client,phone,ville,quartier,adresse,product_name," +
  "product_label,item_count,amount,status,date,source,customer_note," +
  "tracking_number,delivery_status,delivery_status_code,deliverer," +
  "deliverer_phone,delivery_date,created_at,last_modified_at";

export async function getFollowUps(userId: string): Promise<{
  confirmation: FollowUpLead[];
  livraison: FollowUpLead[];
  traite: FollowUpLead[];
}> {
  const supabase = getSupabaseServerClient();

  const [rows, produits, suivis] = await Promise.all([
    fetchAll<Row>(() => supabase.from("leads").select(CHAMPS)),
    supabase.from("products").select("name,image").not("image", "is", null),
    // Seulement les lignes de cette personne : celles des autres ne la
    // regardent pas et ne doivent pas vider sa file.
    fetchAll<SuiviRow>(() =>
      supabase
        .from("lead_follow_ups")
        .select("lead_id,count,marked_at")
        .eq("user_id", userId)
    ),
  ]);

  const avancement = new Map(suivis.map((x) => [x.lead_id, x]));

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
     *
     * Marquer un dossier traite compte comme une action : sans cela
     * l'horloge de l'abandon continuerait de tourner pendant le cycle,
     * et un dossier marque deux fois sortirait de la file au milieu de
     * son propre parcours.
     */
    const lastActionAt = derniereAction(row, avancement.get(row.id));
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
      confirmationStatus: row.status,
      deliveryStatusCode: row.delivery_status_code ?? undefined,
      deliveryDate: row.delivery_date ?? undefined,
      date: row.date ?? "",
      source: row.source ?? "",
      note: row.customer_note?.trim() || undefined,
      trackingNumber: row.tracking_number ?? undefined,
      deliverer: row.deliverer ?? undefined,
      delivererPhone: row.deliverer_phone ?? undefined,
      lastActionAt,
      daysWaiting,
      late: isLate(kind, daysWaiting),
      kind,
      followUpCount: avancement.get(row.id)?.count ?? 0,
    };
  };

  const confirmation: FollowUpLead[] = [];
  const livraison: FollowUpLead[] = [];
  const traite: FollowUpLead[] = [];

  for (const row of rows) {
    // Trois marquages : le dossier a quitte le suivi. Inutile d'aller
    // plus loin, il n'ira dans aucune des trois listes.
    const mien = avancement.get(row.id);
    const etat = followUpState(mien?.count ?? 0, mien?.marked_at, maintenant);
    if (etat === "done") continue;

    // L'anciennete decide aussi de l'appartenance : passe trois jours
    // de silence, un dossier quitte la file au lieu de l'encombrer.
    const jours = daysSince(derniereAction(row, mien), maintenant);

    /*
     * Un colis parti ne se rappelle plus pour etre confirme : c'est la
     * file livraison qui s'en occupe. Sans cette garde, une commande au
     * statut "+3 jours" expediee depuis apparaitrait dans les deux.
     */
    let kind: FollowUpKind | null = null;
    if (
      row.tracking_number &&
      needsDeliveryFollowUp(row.delivery_status_code, jours)
    ) {
      kind = "livraison";
    } else if (
      !row.tracking_number &&
      needsConfirmationFollowUp(row.status, jours)
    ) {
      kind = "confirmation";
    }
    if (!kind) continue;

    const lead = build(row, kind);
    // Un dossier au repos garde sa file d'origine dans `kind`, mais
    // s'affiche dans Traite tant que ses vingt-quatre heures courent.
    if (etat === "resting") traite.push(lead);
    else if (kind === "livraison") livraison.push(lead);
    else confirmation.push(lead);
  }

  const parAnciennete = (a: FollowUpLead, b: FollowUpLead) =>
    b.daysWaiting - a.daysWaiting;

  return {
    confirmation: confirmation.sort(parAnciennete),
    livraison: livraison.sort(parAnciennete),
    traite: traite.sort(parAnciennete),
  };
}

/**
 * La derniere fois qu'on s'est occupe de ce dossier, marquage compris.
 * La plus recente des trois dates connues, jamais la premiere trouvee.
 */
function derniereAction(row: Row, mien?: SuiviRow): string {
  const dates = [mien?.marked_at, row.last_modified_at, row.created_at]
    .filter((d): d is string => Boolean(d))
    .sort();
  return dates.at(-1) ?? row.created_at;
}
