/**
 * Ce que le client a deja fait, avant cet appel.
 *
 * Un agent qui compose un numero ne sait rien de la personne au bout
 * du fil. Or le meme numero revient : quelqu'un qui a deja refuse un
 * colis n'est pas quelqu'un qui en a deja recu un, et cela se decide
 * avant de decrocher, pas apres.
 *
 * Trois pastilles, lues sur les AUTRES commandes du meme numero. La
 * commande en cours ne se juge jamais elle-meme : une premiere
 * commande n'a donc aucune pastille, et c'est voulu — l'absence de
 * marque veut dire "client inconnu", pas "rien a signaler".
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

/**
 * Statuts ou la confirmation est tranchee, dans un sens ou dans
 * l'autre. Tout le reste attend encore un appel.
 */
const DECIDED = new Set([
  "Confirme",
  "EXPIDER",
  "Annulee",
  "Faux numero",
  "Non commandee",
  "Expiree",
  "En double",
  "TESTE",
]);

export type ClientFlag =
  /** Une commande passee n'est pas arrivee. */
  | "failed"
  /** Une autre commande attend encore sa confirmation. */
  | "pending"
  /** Une commande passee a bien ete remise. */
  | "delivered";

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
 * La pastille de chaque commande, par identifiant.
 *
 * Priorite : rouge, puis jaune, puis vert — l'ordre donne par
 * l'exploitant. Un client qui a deja fait revenir un colis reste un
 * risque, meme s'il en a recu un autre : l'avertissement passe devant
 * la bonne nouvelle.
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
      let failed = false;
      let pending = false;
      let delivered = false;

      for (const autre of commandes) {
        if (autre.id === lead.id) continue;
        const code = autre.deliveryStatusCode ?? "";
        if (FAILED.has(code)) failed = true;
        else if (code === DELIVERED) delivered = true;
        if (!DECIDED.has(autre.status)) pending = true;
      }

      const flag: ClientFlag | null = failed
        ? "failed"
        : pending
          ? "pending"
          : delivered
            ? "delivered"
            : null;
      if (flag) flags.set(lead.id, flag);
    }
  }

  return flags;
}
