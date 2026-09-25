import "server-only";
import { getSupabaseServerClient } from "./server";
import { resolveAttribution } from "./attribution";
import { fetchAll } from "./page";
import type {
  AgentAction,
  AgentStats,
  DeliveryStats,
  ProductStats,
  TeamStats,
} from "@/components/dashboard/confirmation-data";

/**
 * Performance reelle des agents.
 *
 * Tout est deduit du journal `lead_events` : c'est la seule trace de ce
 * qu'une personne a reellement fait. La colonne `leads.assigned_to`
 * n'est pas utilisee par l'equipe (elle est vide partout), un compteur
 * d'assignations n'afficherait donc que des zeros ; on compte les
 * commandes traitees, ce qui reflete le travail effectif.
 *
 * Ce qui n'est pas mesure n'est pas invente : l'application ne passe pas
 * les appels, il n'y a donc ni duree d'appel ni duree de session. Ces
 * cases restent vides plutot que remplies d'un chiffre plausible.
 */

/** Statuts qui supposent que le client a ete joint et a repondu. */
const REACHED = new Set([
  "Confirme",
  "EXPIDER",
  "En attente",
  "Reportee",
  "Whatsapp",
  "Annulee",
  "Non commandee",
  "Rappel",
  "+3 jours",
]);

const STATUS_FIELD = "Statut de confirmation";

/** Statuts qui valent confirmation, comme l'onglet "Confirmes". */
const CONFIRMED = new Set(["Confirme", "EXPIDER"]);

/**
 * Cette commande compte-t-elle comme confirmee, et pour quel agent ?
 *
 * Deux conditions, et non une seule. L'agent doit avoir pose le statut
 * — c'est ce qui lui en donne le credit — et la commande doit le porter
 * encore aujourd'hui.
 *
 * La seconde manquait. Une commande confirmee puis ramenee en arriere
 * restait comptee : WC-652 est passee par "Confirme" pendant deux
 * minutes avant d'etre annulee, WC-662 avait ete confirmee trop vite
 * puis rendue a "Injoignable". La partie Confirmation en annonçait donc
 * 107 quand l'onglet "Confirmes" des commandes en montrait 105 — deux
 * ecrans, deux chiffres, pour le meme mot.
 *
 * Une confirmation defaite n'est pas une confirmation : c'est une
 * correction. Le chiffre suit desormais ce que l'on peut compter a
 * l'ecran.
 */
function countsAsConfirmed(
  event: { field: string; new_value: string | null; lead_id: string },
  leads: Map<string, { status: string }>
): boolean {
  if (event.field !== STATUS_FIELD || !event.new_value) return false;
  if (!CONFIRMED.has(event.new_value)) return false;
  const lead = leads.get(event.lead_id);
  return Boolean(lead && CONFIRMED.has(lead.status));
}

/** Une commande close : plus rien a faire dessus. */
const CLOSED = new Set([
  "Confirme",
  "EXPIDER",
  "Annulee",
  "Faux numero",
  "Non commandee",
  "Expiree",
  "En double",
  "TESTE",
]);

/** Commandes qui attendent un rappel a une heure convenue. */
const RECALL = new Set(["Rappel", "Reportee"]);

/** Le client n'a pas decroche : les deux familles numerotees. */
function isNoAnswer(status: string): boolean {
  return status.startsWith("Pas de rep") || status.startsWith("Injoignable");
}

/** Code ForceLog d'un colis remis au client. */
const DELIVERED = "DELIVERED";

/**
 * Codes qui disent qu'un colis ne sera pas remis : retour, refus,
 * annulation, hors zone. Tout autre code est une livraison en cours.
 */
const FAILED = new Set(["RETURNED", "REFUSE", "CANCELED", "OUT_OF_AREA"]);

/**
 * Devenir des commandes confirmees, une fois chez le transporteur.
 *
 * On part des commandes confirmees et d'elles seules : une commande
 * jamais confirmee n'avait pas a etre livree, la compter ferait passer
 * un travail de confirmation pour un echec de livraison.
 */
function deliveryOf(
  confirmedIds: Iterable<string>,
  leads: Map<string, LeadRow>
): DeliveryStats {
  let shipped = 0;
  let delivered = 0;
  let returned = 0;
  let notShipped = 0;

  for (const id of confirmedIds) {
    const lead = leads.get(id);
    if (!lead) continue;
    // Sans numero de suivi, la commande n'est jamais partie.
    if (!lead.tracking_number) {
      notShipped += 1;
      continue;
    }
    shipped += 1;
    const code = lead.delivery_status_code ?? "";
    if (code === DELIVERED) delivered += 1;
    else if (FAILED.has(code)) returned += 1;
  }

  // Un colis livre ou retourne a fini sa course ; celui qui roule
  // encore peut faire les deux et n'a rien a dire d'un taux.
  const settled = delivered + returned;

  return {
    shipped,
    delivered,
    returned,
    inTransit: shipped - delivered - returned,
    notShipped,
    rate: shipped > 0 ? Math.round((delivered / shipped) * 100) : 0,
    settled,
    rateFinal: settled > 0 ? Math.round((delivered / settled) * 100) : 0,
  };
}

/** "17h 8m", "3m 37s", "45s" — jamais plus de deux unites. */
function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const rest = seconds % 60;
    return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest ? `${days}j ${rest}h` : `${days}j`;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** "15 sept., 14:40" — assez court pour la liste de l'historique. */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Casablanca",
  }).format(d);
}

type EventRow = {
  lead_id: string;
  actor_id: string | null;
  actor_name: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
};

type LeadRow = {
  id: string;
  reference: string;
  phone: string | null;
  status: string;
  created_at: string;
  tracking_number: string | null;
  delivery_status_code: string | null;
  product_name: string | null;
};

export async function getAgentStats(
  from?: string,
  to?: string
): Promise<TeamStats> {
  const supabase = getSupabaseServerClient();

  const [profilesRes, leadRows, productsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,name,email,role,status,avatar_color")
      .order("name"),
    fetchAll<LeadRow>(() =>
      supabase
        .from("leads")
        .select(
          "id,reference,phone,status,created_at,tracking_number,delivery_status_code,product_name"
        )
    ),
    supabase.from("products").select("name,image").not("image", "is", null),
  ]);

  if (profilesRes.error) throw new Error(profilesRes.error.message);

  const leads = new Map<string, LeadRow>(leadRows.map((l) => [l.id, l]));

  // Lecture complete : au-dela de mille evenements, une lecture simple
  // s'arrete sans le dire et les gestes les plus recents disparaissent.
  const events = await fetchAll<EventRow>(() => {
    let query = supabase
      .from("lead_events")
      .select("lead_id,actor_id,actor_name,field,old_value,new_value,created_at")
      .order("created_at", { ascending: true });
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);
    return query;
  });

  const profiles = (profilesRes.data ?? []) as {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    avatar_color: string;
  }[];

  // Seuls les agents ont une fiche de performance : ce sont eux qui
  // appellent. Un administrateur passe corriger une commande de temps a
  // autre, et ses gestes sont reportes sur l'agent a qui la commande
  // revient.
  const adminIds = new Set(
    profiles.filter((p) => p.role === "Admin").map((p) => p.id)
  );
  const agentProfiles = profiles.filter((p) => p.role !== "Admin");
  const agentIds = new Set(agentProfiles.map((p) => p.id));
  const attribution = resolveAttribution(events, adminIds, agentIds);

  /** L'agent credite d'un evenement, administrateur deja reporte. */
  const creditedTo = (event: EventRow) => attribution.get(event) ?? null;

  // Les evenements sont regroupes par auteur puis par commande : c'est
  // ce double regroupement qui permet de compter des commandes
  // distinctes, et non des clics.
  const byActor = new Map<string, EventRow[]>();
  for (const event of events) {
    // Les automates (WooCommerce, ForceLog, Google Sheets) n'ont pas de
    // compte : ils ne figurent pas dans la performance de l'equipe.
    const credited = creditedTo(event);
    if (!credited) continue;
    const list = byActor.get(credited);
    if (list) list.push(event);
    else byActor.set(credited, [event]);
  }

  const agents: AgentStats[] = agentProfiles.map((profile) => {
    const own = byActor.get(profile.id) ?? [];

    const perLead = new Map<string, EventRow[]>();
    for (const event of own) {
      const list = perLead.get(event.lead_id);
      if (list) list.push(event);
      else perLead.set(event.lead_id, [event]);
    }

    const contacted = new Set<string>();
    const confirmed = new Set<string>();
    for (const event of own) {
      if (event.field !== STATUS_FIELD || !event.new_value) continue;
      if (REACHED.has(event.new_value)) contacted.add(event.lead_id);
      if (countsAsConfirmed(event, leads)) confirmed.add(event.lead_id);
    }

    let pending = 0;
    let rappels = 0;
    let sansReponse = 0;
    const firstTouchDelays: number[] = [];
    const handlingSpans: number[] = [];

    for (const [leadId, leadEvents] of perLead) {
      const lead = leads.get(leadId);
      if (lead && !CLOSED.has(lead.status)) {
        pending += 1;
        // Deux facons d'etre en cours qui n'appellent pas le meme geste :
        // l'une attend une heure, l'autre attend que le client decroche.
        if (RECALL.has(lead.status)) rappels += 1;
        else if (isNoAnswer(lead.status)) sansReponse += 1;
      }

      const times = leadEvents.map((e) => new Date(e.created_at).getTime());
      const first = Math.min(...times);
      const last = Math.max(...times);

      if (lead) {
        const born = new Date(lead.created_at).getTime();
        // Un geste anterieur a la commande n'existe pas : ce serait une
        // horloge desaccordee, on l'ecarte plutot que de fausser la moyenne.
        if (Number.isFinite(born) && first >= born) {
          firstTouchDelays.push(first - born);
        }
      }
      // Une commande reglee d'un seul geste n'a pas de duree de
      // traitement mesurable : la compter comme zero tirerait la
      // moyenne vers le bas sans rien decrire.
      if (leadEvents.length > 1) handlingSpans.push(last - first);
    }

    const treated = perLead.size;

    const history: AgentAction[] = own
      .slice()
      .reverse()
      .slice(0, 40)
      .map((event) => {
        const lead = leads.get(event.lead_id);
        return {
          reference: lead?.reference ?? "Commande supprimee",
          phone: lead?.phone ?? "",
          when: formatWhen(event.created_at),
          field: event.field,
          from: event.old_value,
          to: event.new_value ?? "",
        };
      });

    return {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      active: profile.status === "Actif",
      avatarColor: profile.avatar_color,
      treated,
      contacted: contacted.size,
      confirmed: confirmed.size,
      pending,
      rappels,
      sansReponse,
      confirmRate: treated > 0 ? Math.round((confirmed.size / treated) * 100) : 0,
      avgFirstTouch: formatDuration(average(firstTouchDelays)),
      avgHandling: formatDuration(average(handlingSpans)),
      avgCallDuration: "—",
      actions: own.length,
      history,
      delivery: deliveryOf(confirmed, leads),
    };
  });

  // Les totaux d'equipe comptent des commandes distinctes, pas la somme
  // des colonnes : deux agents sur la meme commande ne font pas deux
  // commandes.
  const teamTreated = new Set<string>();
  const teamContacted = new Set<string>();
  const teamConfirmed = new Set<string>();
  const teamFirstTouch: number[] = [];
  const teamHandling: number[] = [];

  const perLeadAll = new Map<string, EventRow[]>();
  for (const event of events) {
    if (!creditedTo(event)) continue;
    teamTreated.add(event.lead_id);
    if (event.field === STATUS_FIELD && event.new_value) {
      if (REACHED.has(event.new_value)) teamContacted.add(event.lead_id);
      if (countsAsConfirmed(event, leads)) teamConfirmed.add(event.lead_id);
    }
    const list = perLeadAll.get(event.lead_id);
    if (list) list.push(event);
    else perLeadAll.set(event.lead_id, [event]);
  }

  for (const [leadId, leadEvents] of perLeadAll) {
    const lead = leads.get(leadId);
    const times = leadEvents.map((e) => new Date(e.created_at).getTime());
    const first = Math.min(...times);
    const last = Math.max(...times);
    if (lead) {
      const born = new Date(lead.created_at).getTime();
      if (Number.isFinite(born) && first >= born) teamFirstTouch.push(first - born);
    }
    if (leadEvents.length > 1) teamHandling.push(last - first);
  }

  // Ventilation par produit. Les memes definitions que pour l'equipe,
  // appliquees a un sous-ensemble : traitees, contactees, confirmees, et
  // le devenir des confirmees chez le transporteur.
  const byProduct = new Map<
    string,
    { treated: Set<string>; contacted: Set<string>; confirmed: Set<string> }
  >();

  const productOf = (leadId: string) =>
    (leads.get(leadId)?.product_name ?? "").trim() || "Sans produit";

  for (const event of events) {
    if (!creditedTo(event)) continue;
    const key = productOf(event.lead_id);
    const entry =
      byProduct.get(key) ??
      { treated: new Set<string>(), contacted: new Set<string>(), confirmed: new Set<string>() };
    entry.treated.add(event.lead_id);
    if (event.field === STATUS_FIELD && event.new_value) {
      if (REACHED.has(event.new_value)) entry.contacted.add(event.lead_id);
      if (countsAsConfirmed(event, leads)) entry.confirmed.add(event.lead_id);
    }
    byProduct.set(key, entry);
  }

  const imageByProduct = new Map(
    ((productsRes.data ?? []) as { name: string; image: string }[]).map((p) => [
      p.name.trim().toLowerCase(),
      p.image,
    ])
  );

  const products: ProductStats[] = [...byProduct.entries()]
    .map(([product, entry]) => ({
      product,
      image: imageByProduct.get(product.toLowerCase()),
      treated: entry.treated.size,
      contacted: entry.contacted.size,
      confirmed: entry.confirmed.size,
      confirmRate:
        entry.treated.size > 0
          ? Math.round((entry.confirmed.size / entry.treated.size) * 100)
          : 0,
      delivery: deliveryOf(entry.confirmed, leads),
    }))
    .sort((a, b) => b.treated - a.treated);

  /*
   * Les commandes dont le traitement est termine.
   *
   * CLOSED les enumere deja : confirmee, annulee, faux numero, non
   * commandee, expiree, en double, test. Tout le reste attend encore
   * quelque chose — un rappel, un client qui decroche — et n'a rien a
   * faire au denominateur d'un taux de reussite.
   */
  let teamClosed = 0;
  for (const id of teamTreated) {
    const lead = leads.get(id);
    if (lead && CLOSED.has(lead.status)) teamClosed += 1;
  }

  return {
    agents,
    products,
    team: {
      treated: teamTreated.size,
      contacted: teamContacted.size,
      confirmed: teamConfirmed.size,
      closed: teamClosed,
      confirmRateFinal:
        teamClosed > 0
          ? Math.round((teamConfirmed.size / teamClosed) * 100)
          : 0,
      confirmRate:
        teamTreated.size > 0
          ? Math.round((teamConfirmed.size / teamTreated.size) * 100)
          : 0,
      avgHandling: formatDuration(average(teamHandling)),
      avgFirstTouch: formatDuration(average(teamFirstTouch)),
    },
    delivery: deliveryOf(teamConfirmed, leads),
  };
}
