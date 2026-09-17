import "server-only";
import { getSupabaseServerClient } from "./server";
import { resolveAttribution } from "./attribution";
import type {
  AgentAction,
  AgentStats,
  DeliveryStats,
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

/** Statuts qui valent confirmation, comme l'onglet "Confirmes". */
const CONFIRMED = new Set(["Confirme", "EXPIDER"]);

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

const STATUS_FIELD = "Statut de confirmation";

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

  return {
    shipped,
    delivered,
    returned,
    inTransit: shipped - delivered - returned,
    notShipped,
    rate: shipped > 0 ? Math.round((delivered / shipped) * 100) : 0,
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
};

export async function getAgentStats(
  from?: string,
  to?: string
): Promise<TeamStats> {
  const supabase = getSupabaseServerClient();

  const [profilesRes, leadsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,name,email,role,status,avatar_color")
      .order("name"),
    supabase
      .from("leads")
      .select(
        "id,reference,phone,status,created_at,tracking_number,delivery_status_code"
      ),
  ]);

  if (profilesRes.error) throw new Error(profilesRes.error.message);
  if (leadsRes.error) throw new Error(leadsRes.error.message);

  const leads = new Map<string, LeadRow>(
    ((leadsRes.data ?? []) as LeadRow[]).map((l) => [l.id, l])
  );

  let query = supabase
    .from("lead_events")
    .select("lead_id,actor_id,actor_name,field,old_value,new_value,created_at")
    .order("created_at", { ascending: true });
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);

  const eventsRes = await query;
  if (eventsRes.error) throw new Error(eventsRes.error.message);
  const events = (eventsRes.data ?? []) as EventRow[];

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
      if (CONFIRMED.has(event.new_value)) confirmed.add(event.lead_id);
    }

    let pending = 0;
    const firstTouchDelays: number[] = [];
    const handlingSpans: number[] = [];

    for (const [leadId, leadEvents] of perLead) {
      const lead = leads.get(leadId);
      if (lead && !CLOSED.has(lead.status)) pending += 1;

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
      if (CONFIRMED.has(event.new_value)) teamConfirmed.add(event.lead_id);
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

  return {
    agents,
    team: {
      treated: teamTreated.size,
      contacted: teamContacted.size,
      confirmed: teamConfirmed.size,
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
