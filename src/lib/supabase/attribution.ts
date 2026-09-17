/**
 * A quel agent revient une commande traitee par un administrateur.
 *
 * Dans cette equipe, ce sont les agents qui appellent et confirment. Un
 * administrateur ne fait que passer : il corrige une ville, rectifie un
 * statut. Compter ses gestes comme sa propre performance creerait un
 * agent fantome qui n'a jamais decroche un telephone, et retirerait a
 * l'agent le travail qu'il a fait.
 *
 * Les gestes d'un administrateur sont donc reportes sur un agent, selon
 * deux regles, dans cet ordre :
 *
 *   1. un agent a touche la meme commande : c'est la sienne, on lui
 *      rend. Entre plusieurs, celui dont le geste est le plus proche
 *      dans le temps ;
 *   2. personne d'autre n'y a touche : si un seul agent a travaille
 *      pendant la periode regardee, la commande lui revient.
 *
 * Quand ni l'une ni l'autre ne tranche — plusieurs agents actifs et
 * aucune trace sur la commande — le geste reste sans attribution plutot
 * que d'etre attribue au hasard. Il compte toujours dans les totaux de
 * l'equipe, mais n'apparait sur la fiche de personne.
 *
 * Module pur : l'appelant fournit les evenements et les roles.
 */

export type AttributableEvent = {
  lead_id: string;
  actor_id: string | null;
  created_at: string;
};

export function resolveAttribution<T extends AttributableEvent>(
  events: T[],
  adminIds: ReadonlySet<string>,
  agentIds: ReadonlySet<string>
): Map<T, string | null> {
  const attribution = new Map<T, string | null>();

  // Les gestes d'agents sur chaque commande, pour savoir a qui elle est.
  const agentEventsByLead = new Map<string, T[]>();
  for (const event of events) {
    if (!event.actor_id || !agentIds.has(event.actor_id)) continue;
    const list = agentEventsByLead.get(event.lead_id);
    if (list) list.push(event);
    else agentEventsByLead.set(event.lead_id, [event]);
  }

  // Les agents ayant travaille pendant la periode. Un seul : tout ce qui
  // n'est pas rattachable lui revient. Plusieurs : on ne devine pas.
  const activeAgents = new Set<string>();
  for (const event of events) {
    if (event.actor_id && agentIds.has(event.actor_id)) {
      activeAgents.add(event.actor_id);
    }
  }
  const soleAgent = activeAgents.size === 1 ? [...activeAgents][0] : null;

  for (const event of events) {
    if (!event.actor_id) {
      attribution.set(event, null);
      continue;
    }
    if (!adminIds.has(event.actor_id)) {
      attribution.set(event, event.actor_id);
      continue;
    }

    const onSameLead = agentEventsByLead.get(event.lead_id);
    if (onSameLead?.length) {
      const when = new Date(event.created_at).getTime();
      const closest = onSameLead.reduce((best, candidate) =>
        Math.abs(new Date(candidate.created_at).getTime() - when) <
        Math.abs(new Date(best.created_at).getTime() - when)
          ? candidate
          : best
      );
      attribution.set(event, closest.actor_id);
      continue;
    }

    attribution.set(event, soleAgent);
  }

  return attribution;
}
