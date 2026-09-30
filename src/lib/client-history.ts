/**
 * Ce que le client a deja fait, avant cet appel.
 *
 * Un agent qui compose un numero ne sait rien de la personne au bout
 * du fil. Or le meme numero revient : quelqu'un qui a deja refuse un
 * colis n'est pas quelqu'un qui en a deja recu un, et cela se decide
 * avant de decrocher, pas apres.
 *
 * Des qu'une autre commande existe au meme numero, une pastille
 * s'affiche — quel que soit son statut. La premiere version se taisait
 * sur les commandes annulees, les faux numeros et les doublons : un
 * client deja rappele trois fois sans succes passait pour un inconnu,
 * ce qui est exactement l'inverse de ce qu'il fallait montrer.
 *
 * Seule une premiere commande reste sans marque. L'absence de point
 * veut dire "client inconnu", pas "rien a signaler".
 */

/** Code ForceLog d'un colis remis au client. */
const DELIVERED = "DELIVERED";

/**
 * Codes qui disent qu'un colis n'arrivera pas : retour, refus,
 * annulation des deux cotes, hors zone. Un colis encore en route n'en
 * fait pas partie : il peut finir remis, et l'accuser d'avance
 * marquerait un bon client en rouge.
 */
const FAILED = new Set([
  "RETURNED",
  "REFUSE",
  "CANCELED",
  "CANCELED_TEAM",
  "OUT_OF_AREA",
]);

/** La commande est allee au bout de la confirmation, et a ete retenue. */
const CONFIRMED = new Set(["Confirme", "EXPIDER"]);

/**
 * La commande a ete ecartee a la confirmation : le client a renonce,
 * n'avait rien commande, ou la ligne ne valait rien. Elle n'est jamais
 * partie chez le transporteur.
 */
const REJECTED = new Set([
  "Annulee",
  "Non commandee",
  "Faux numero",
  "En double",
  "Expiree",
  "TESTE",
]);

export type ClientFlag =
  /** Une commande passee n'est pas arrivee. */
  | "failed"
  /** Une commande passee a bien ete remise. */
  | "delivered"
  /** Une commande passee a ete ecartee a la confirmation. */
  | "rejected"
  /** Une autre commande attend encore sa confirmation. */
  | "pending"
  /** Une autre commande est confirmee et encore en route. */
  | "inTransit";

export type HistoryLead = {
  id: string;
  phone: string;
  status: string;
  deliveryStatusCode?: string;
};

/**
 * Le meme numero, ecrit de plusieurs facons.
 *
 * "0612345678", "+212 612 345 678" et "212612345678" designent une
 * seule personne. Sans mise au meme format, chaque commande passerait
 * pour celle d'un inconnu et aucune pastille n'apparaitrait jamais.
 */
export function normalizePhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  // Indicatif marocain : on revient a la notation nationale.
  if (digits.startsWith("212")) return `0${digits.slice(3)}`;
  if (digits.startsWith("0")) return digits;
  return `0${digits}`;
}

/**
 * Ce qu'une commande passee raconte, a elle seule.
 *
 * L'ordre du test compte : le sort du colis prime sur le statut de
 * confirmation, parce qu'une commande livree est forcement confirmee
 * et que c'est la livraison qui renseigne.
 */
function readOne(lead: HistoryLead): ClientFlag | null {
  const code = lead.deliveryStatusCode ?? "";
  if (code === DELIVERED) return "delivered";
  if (FAILED.has(code)) return "failed";
  if (REJECTED.has(lead.status)) return "rejected";
  if (CONFIRMED.has(lead.status)) return "inTransit";
  return "pending";
}

/**
 * Priorite entre plusieurs commandes passees, du plus parlant au moins
 * parlant.
 *
 * Un colis revenu passe devant tout : c'est ce qui coute de l'argent.
 * Vient ensuite un colis remis, qui est la meilleure nouvelle qu'on
 * puisse avoir sur un client. Les trois autres decrivent des
 * commandes qui n'ont encore rien prouve.
 */
const PRIORITE: ClientFlag[] = [
  "failed",
  "delivered",
  "rejected",
  "pending",
  "inTransit",
];

/**
 * La pastille de chaque commande, par identifiant.
 *
 * Les commandes sans numero de telephone sont laissees de cote : les
 * regrouper par chaine vide ferait d'elles un seul et meme client.
 */
export function clientFlags(leads: HistoryLead[]): Map<string, ClientFlag> {
  const parNumero = new Map<string, HistoryLead[]>();
  for (const lead of leads) {
    const numero = normalizePhone(lead.phone);
    if (!numero) continue;
    const list = parNumero.get(numero);
    if (list) list.push(lead);
    else parNumero.set(numero, [lead]);
  }

  const flags = new Map<string, ClientFlag>();

  for (const commandes of parNumero.values()) {
    // Un seul passage : rien a raconter sur ce client.
    if (commandes.length < 2) continue;

    for (const lead of commandes) {
      const vus = new Set<ClientFlag>();
      for (const autre of commandes) {
        // Une commande ne se juge jamais sur elle-meme.
        if (autre.id === lead.id) continue;
        const lu = readOne(autre);
        if (lu) vus.add(lu);
      }
      const retenu = PRIORITE.find((f) => vus.has(f));
      if (retenu) flags.set(lead.id, retenu);
    }
  }

  return flags;
}
