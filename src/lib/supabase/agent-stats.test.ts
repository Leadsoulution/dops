import { describe, it, expect, vi, beforeEach } from "vitest";

const from = vi.fn();
vi.mock("./server", () => ({
  getSupabaseServerClient: () => ({ from }),
}));

import { getAgentStats } from "./agent-stats";

const HOUR = 3600_000;
const BASE = Date.parse("2026-09-15T08:00:00.000Z");
const at = (hours: number) => new Date(BASE + hours * HOUR).toISOString();

type Profile = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  avatar_color: string;
};

type Lead = {
  id: string;
  reference: string;
  phone: string;
  status: string;
  created_at: string;
};

type Event = {
  lead_id: string;
  actor_id: string | null;
  actor_name: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
};

/**
 * Un faux client Supabase qui rejoue trois tables. Les appels sur
 * `lead_events` sont chaines (`.select().order().gte().lte()`) et le
 * resultat n'est lu qu'au `await` : le thenable final applique les
 * bornes de date, comme le ferait le serveur.
 */
function stubTables(profiles: Profile[], leads: Lead[], events: Event[]) {
  from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return { select: () => ({ order: () => ({ data: profiles, error: null }) }) };
    }
    if (table === "leads") {
      return { select: () => ({ data: leads, error: null }) };
    }
    let lower: string | undefined;
    let upper: string | undefined;
    const chain = {
      select: () => chain,
      order: () => chain,
      gte: (_col: string, value: string) => {
        lower = value;
        return chain;
      },
      lte: (_col: string, value: string) => {
        upper = value;
        return chain;
      },
      then: (resolve: (r: { data: Event[]; error: null }) => void) =>
        resolve({
          data: events.filter(
            (e) =>
              (!lower || e.created_at >= lower) && (!upper || e.created_at <= upper)
          ),
          error: null,
        }),
    };
    return chain;
  });
}

const ALICE: Profile = {
  id: "a",
  name: "Alice",
  email: "alice@example.com",
  role: "Agent",
  status: "Actif",
  avatar_color: "bg-blue-600",
};
const BOB: Profile = {
  id: "b",
  name: "Bob",
  email: "bob@example.com",
  role: "Admin",
  status: "Inactif",
  avatar_color: "bg-gray-900",
};

function statusEvent(
  leadId: string,
  actor: Profile,
  to: string,
  hours: number,
  fromValue: string | null = "Nouveau"
): Event {
  return {
    lead_id: leadId,
    actor_id: actor.id,
    actor_name: actor.name,
    field: "Statut de confirmation",
    old_value: fromValue,
    new_value: to,
    created_at: at(hours),
  };
}

beforeEach(() => {
  from.mockReset();
});

describe("getAgentStats", () => {
  it("compte des commandes distinctes, pas des clics", async () => {
    stubTables(
      [ALICE],
      [
        { id: "1", reference: "WC-1", phone: "06", status: "Pas de rep 2", created_at: at(0) },
        { id: "2", reference: "WC-2", phone: "06", status: "EXPIDER", created_at: at(0) },
      ],
      [
        statusEvent("1", ALICE, "Pas de rep 1", 1),
        statusEvent("1", ALICE, "Pas de rep 2", 2, "Pas de rep 1"),
        statusEvent("2", ALICE, "EXPIDER", 3),
      ]
    );

    const { agents } = await getAgentStats();
    // Trois changements, mais deux commandes.
    expect(agents[0].actions).toBe(3);
    expect(agents[0].treated).toBe(2);
    expect(agents[0].confirmed).toBe(1);
    expect(agents[0].confirmRate).toBe(50);
  });

  it("ne compte comme contact que les statuts ou le client a repondu", async () => {
    stubTables(
      [ALICE],
      [
        { id: "1", reference: "WC-1", phone: "06", status: "Pas de rep 1", created_at: at(0) },
        { id: "2", reference: "WC-2", phone: "06", status: "Injoignable 1", created_at: at(0) },
        { id: "3", reference: "WC-3", phone: "06", status: "En attente", created_at: at(0) },
      ],
      [
        statusEvent("1", ALICE, "Pas de rep 1", 1),
        statusEvent("2", ALICE, "Injoignable 1", 1),
        statusEvent("3", ALICE, "En attente", 1),
      ]
    );

    const { agents } = await getAgentStats();
    expect(agents[0].treated).toBe(3);
    // Seule "En attente" suppose une conversation.
    expect(agents[0].contacted).toBe(1);
  });

  it("ne compte en cours que les commandes encore ouvertes", async () => {
    stubTables(
      [ALICE],
      [
        { id: "1", reference: "WC-1", phone: "06", status: "Rappel", created_at: at(0) },
        { id: "2", reference: "WC-2", phone: "06", status: "Annulee", created_at: at(0) },
        { id: "3", reference: "WC-3", phone: "06", status: "Confirme", created_at: at(0) },
      ],
      [
        statusEvent("1", ALICE, "Rappel", 1),
        statusEvent("2", ALICE, "Annulee", 1),
        statusEvent("3", ALICE, "Confirme", 1),
      ]
    );

    const { agents } = await getAgentStats();
    expect(agents[0].pending).toBe(1);
  });

  it("ignore les automates, qui n'ont pas de compte", async () => {
    stubTables(
      [ALICE],
      [{ id: "1", reference: "WC-1", phone: "06", status: "Nouveau", created_at: at(0) }],
      [
        {
          lead_id: "1",
          actor_id: null,
          actor_name: "WooCommerce",
          field: "Creation",
          old_value: null,
          new_value: "Commande importee",
          created_at: at(0),
        },
      ]
    );

    const { agents, team } = await getAgentStats();
    expect(agents[0].treated).toBe(0);
    expect(team.treated).toBe(0);
  });

  it("mesure la prise en charge et la duree de traitement", async () => {
    stubTables(
      [ALICE],
      [{ id: "1", reference: "WC-1", phone: "06", status: "Confirme", created_at: at(0) }],
      [
        statusEvent("1", ALICE, "Pas de rep 1", 2),
        statusEvent("1", ALICE, "Confirme", 5, "Pas de rep 1"),
      ]
    );

    const { agents } = await getAgentStats();
    expect(agents[0].avgFirstTouch).toBe("2h");
    expect(agents[0].avgHandling).toBe("3h");
  });

  it("laisse vide ce qui n'est pas mesurable", async () => {
    stubTables(
      [ALICE],
      [{ id: "1", reference: "WC-1", phone: "06", status: "Confirme", created_at: at(0) }],
      // Un seul geste : aucune duree de traitement a en tirer.
      [statusEvent("1", ALICE, "Confirme", 1)]
    );

    const { agents } = await getAgentStats();
    expect(agents[0].avgHandling).toBe("—");
    expect(agents[0].avgCallDuration).toBe("—");
  });

  it("n'attribue rien a un agent qui n'a rien fait", async () => {
    stubTables(
      [ALICE, BOB],
      [{ id: "1", reference: "WC-1", phone: "06", status: "Confirme", created_at: at(0) }],
      [statusEvent("1", ALICE, "Confirme", 1)]
    );

    const { agents } = await getAgentStats();
    const bob = agents.find((a) => a.name === "Bob")!;
    expect(bob.treated).toBe(0);
    expect(bob.confirmRate).toBe(0);
    expect(bob.active).toBe(false);
    expect(bob.history).toEqual([]);
  });

  it("ne compte pas deux fois une commande partagee par deux agents", async () => {
    stubTables(
      [ALICE, BOB],
      [{ id: "1", reference: "WC-1", phone: "06", status: "Confirme", created_at: at(0) }],
      [
        statusEvent("1", ALICE, "Pas de rep 1", 1),
        statusEvent("1", BOB, "Confirme", 2, "Pas de rep 1"),
      ]
    );

    const { agents, team } = await getAgentStats();
    expect(agents.find((a) => a.name === "Alice")!.treated).toBe(1);
    expect(agents.find((a) => a.name === "Bob")!.treated).toBe(1);
    // Une seule commande a ete traitee par l'equipe.
    expect(team.treated).toBe(1);
    expect(team.confirmed).toBe(1);
  });

  it("restreint le calcul a la periode demandee", async () => {
    stubTables(
      [ALICE],
      [
        { id: "1", reference: "WC-1", phone: "06", status: "Confirme", created_at: at(0) },
        { id: "2", reference: "WC-2", phone: "06", status: "Confirme", created_at: at(0) },
      ],
      [
        statusEvent("1", ALICE, "Confirme", 1),
        statusEvent("2", ALICE, "Confirme", 40),
      ]
    );

    const { agents } = await getAgentStats(at(0), at(24));
    expect(agents[0].treated).toBe(1);
  });

  it("rapporte l'historique du plus recent au plus ancien", async () => {
    stubTables(
      [ALICE],
      [{ id: "1", reference: "WC-1", phone: "0600000000", status: "Confirme", created_at: at(0) }],
      [
        statusEvent("1", ALICE, "Pas de rep 1", 1),
        statusEvent("1", ALICE, "Confirme", 2, "Pas de rep 1"),
      ]
    );

    const { agents } = await getAgentStats();
    expect(agents[0].history.map((h) => h.to)).toEqual(["Confirme", "Pas de rep 1"]);
    expect(agents[0].history[0].reference).toBe("WC-1");
    expect(agents[0].history[0].phone).toBe("0600000000");
  });
});
