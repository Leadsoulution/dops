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
  tracking_number?: string | null;
  delivery_status_code?: string | null;
  product_name?: string | null;
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
    // Les photos de produits : la ventilation par produit les demande,
    // et elles n'ont pas d'incidence sur les comptes.
    if (table === "products") {
      return { select: () => ({ not: () => ({ data: [], error: null }) }) };
    }

    if (table === "leads") {
      return { select: () => sliceable(leads) };
    }

    // `lead_events` se lit avec des bornes de date puis par tranches.
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
      range: (start: number, end: number) =>
        Promise.resolve({
          data: events
            .filter(
              (e) =>
                (!lower || e.created_at >= lower) &&
                (!upper || e.created_at <= upper)
            )
            .slice(start, end + 1),
          error: null,
        }),
    };
    return chain;
  });
}

/**
 * Une lecture par tranches, comme Supabase la sert : jamais plus de
 * mille lignes a la fois.
 */
function sliceable<T>(rows: T[]) {
  return {
    range: (start: number, end: number) =>
      Promise.resolve({ data: rows.slice(start, end + 1), error: null }),
  };
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
  role: "Agent",
  status: "Inactif",
  avatar_color: "bg-gray-900",
};

/** Un administrateur : il corrige, il n'appelle pas. */
const PATRON: Profile = {
  id: "p",
  name: "Patron",
  email: "patron@example.com",
  role: "Admin",
  status: "Actif",
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

  it("ecarte du taux final les commandes encore en cours", async () => {
    stubTables(
      [ALICE],
      [
        { id: "1", reference: "WC-1", phone: "06", status: "Confirme", created_at: at(0) },
        { id: "2", reference: "WC-2", phone: "06", status: "Annulee", created_at: at(0) },
        // Celles-ci attendent encore : un rappel, un client qui decroche.
        { id: "3", reference: "WC-3", phone: "06", status: "Rappel", created_at: at(0) },
        { id: "4", reference: "WC-4", phone: "06", status: "Pas de rep 1", created_at: at(0) },
      ],
      [
        statusEvent("1", ALICE, "Confirme", 1),
        statusEvent("2", ALICE, "Annulee", 1),
        statusEvent("3", ALICE, "Rappel", 1),
        statusEvent("4", ALICE, "Pas de rep 1", 1),
      ]
    );

    const { team } = await getAgentStats();
    expect(team.treated).toBe(4);
    expect(team.confirmed).toBe(1);
    // Une commande sur quatre traitees...
    expect(team.confirmRate).toBe(25);
    // ...mais une sur deux tranchees. Les deux en cours ne sont pas des
    // echecs, seulement des dossiers ouverts.
    expect(team.closed).toBe(2);
    expect(team.confirmRateFinal).toBe(50);
  });

  it("ecarte du taux final les colis encore en route", async () => {
    stubTables(
      [ALICE],
      [
        { id: "1", reference: "WC-1", phone: "06", status: "Confirme", created_at: at(0),
          tracking_number: "F-1", delivery_status_code: "DELIVERED" },
        { id: "2", reference: "WC-2", phone: "06", status: "Confirme", created_at: at(0),
          tracking_number: "F-2", delivery_status_code: "RETURNED" },
        // Parti ce matin : il n'a pas encore eu l'occasion d'echouer.
        { id: "3", reference: "WC-3", phone: "06", status: "Confirme", created_at: at(0),
          tracking_number: "F-3", delivery_status_code: "DISTRIBUTION" },
        { id: "4", reference: "WC-4", phone: "06", status: "Confirme", created_at: at(0),
          tracking_number: "F-4", delivery_status_code: "DISTRIBUTION" },
      ],
      [
        statusEvent("1", ALICE, "Confirme", 1),
        statusEvent("2", ALICE, "Confirme", 1),
        statusEvent("3", ALICE, "Confirme", 1),
        statusEvent("4", ALICE, "Confirme", 1),
      ]
    );

    const { delivery } = await getAgentStats();
    expect(delivery.shipped).toBe(4);
    expect(delivery.delivered).toBe(1);
    expect(delivery.returned).toBe(1);
    expect(delivery.inTransit).toBe(2);
    // Un sur quatre expedies...
    expect(delivery.rate).toBe(25);
    // ...mais un sur deux arrives au bout.
    expect(delivery.settled).toBe(2);
    expect(delivery.rateFinal).toBe(50);
  });

  it("rend zero plutot qu'une division impossible", async () => {
    stubTables([ALICE], [], []);
    const { team, delivery } = await getAgentStats();
    expect(team.confirmRateFinal).toBe(0);
    expect(delivery.rateFinal).toBe(0);
  });

  it("ne compte plus une confirmation qui a ete defaite", async () => {
    stubTables(
      [ALICE],
      [
        // Confirmee, et elle l'est restee.
        { id: "1", reference: "WC-1", phone: "06", status: "Confirme", created_at: at(0) },
        // Confirmee deux minutes, puis annulee : une correction, pas
        // une confirmation.
        { id: "2", reference: "WC-2", phone: "06", status: "Annulee", created_at: at(0) },
      ],
      [
        statusEvent("1", ALICE, "Confirme", 1),
        statusEvent("2", ALICE, "Confirme", 1),
        statusEvent("2", ALICE, "Annulee", 2, "Confirme"),
      ]
    );

    const { agents, team } = await getAgentStats();
    // Sans cette regle, la partie Confirmation annonçait deux
    // confirmations quand l'onglet "Confirmes" des commandes n'en
    // montrait qu'une.
    expect(agents[0].confirmed).toBe(1);
    expect(agents[0].confirmRate).toBe(50);
    expect(team.confirmed).toBe(1);
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

describe("livraison", () => {
  it("ne compte que les commandes que l'agent a confirmees", () => {
    // Celle qu'Alice a seulement rappelee est livree, mais ce n'est pas
    // elle qui l'a confirmee : elle n'entre pas dans son taux.
    stubTables(
      [ALICE],
      [
        { id: "1", reference: "A", phone: "06", status: "Confirme", created_at: at(0),
          tracking_number: "F-1", delivery_status_code: "DELIVERED" },
        { id: "2", reference: "B", phone: "06", status: "Confirme", created_at: at(0),
          tracking_number: "F-2", delivery_status_code: "DELIVERED" },
      ],
      [
        statusEvent("1", ALICE, "Confirme", 1),
        statusEvent("2", ALICE, "Rappel", 1),
      ]
    );
    return getAgentStats().then(({ agents }) => {
      expect(agents[0].delivery.shipped).toBe(1);
      expect(agents[0].delivery.delivered).toBe(1);
      expect(agents[0].delivery.rate).toBe(100);
    });
  });

  it("separe livrees, retours et livraisons en cours", async () => {
    stubTables(
      [ALICE],
      [
        { id: "1", reference: "A", phone: "06", status: "Confirme", created_at: at(0),
          tracking_number: "F-1", delivery_status_code: "DELIVERED" },
        { id: "2", reference: "B", phone: "06", status: "Confirme", created_at: at(0),
          tracking_number: "F-2", delivery_status_code: "RETURNED" },
        { id: "3", reference: "C", phone: "06", status: "Confirme", created_at: at(0),
          tracking_number: "F-3", delivery_status_code: "DISTRIBUTION" },
        { id: "4", reference: "D", phone: "06", status: "Confirme", created_at: at(0),
          tracking_number: "F-4", delivery_status_code: "REFUSE" },
      ],
      ["1", "2", "3", "4"].map((id) => statusEvent(id, ALICE, "Confirme", 1))
    );
    const { agents } = await getAgentStats();
    expect(agents[0].delivery).toMatchObject({
      shipped: 4, delivered: 1, returned: 2, inTransit: 1, notShipped: 0, rate: 25,
    });
  });

  it("compte a part une commande confirmee jamais expediee", async () => {
    stubTables(
      [ALICE],
      [
        { id: "1", reference: "A", phone: "06", status: "Confirme", created_at: at(0),
          tracking_number: null, delivery_status_code: null },
        { id: "2", reference: "B", phone: "06", status: "Confirme", created_at: at(0),
          tracking_number: "F-2", delivery_status_code: "DELIVERED" },
      ],
      ["1", "2"].map((id) => statusEvent(id, ALICE, "Confirme", 1))
    );
    const { agents } = await getAgentStats();
    // Le taux porte sur ce qui est parti, pas sur ce qui aurait du partir.
    expect(agents[0].delivery).toMatchObject({
      shipped: 1, delivered: 1, notShipped: 1, rate: 100,
    });
  });

  it("ne compte pas deux fois une commande confirmee par deux agents", async () => {
    stubTables(
      [ALICE, BOB],
      [{ id: "1", reference: "A", phone: "06", status: "Confirme", created_at: at(0),
         tracking_number: "F-1", delivery_status_code: "DELIVERED" }],
      [statusEvent("1", ALICE, "Confirme", 1), statusEvent("1", BOB, "EXPIDER", 2, "Confirme")]
    );
    // `delivery` est au niveau du resultat, a cote de `team`.
    const { delivery } = await getAgentStats();
    expect(delivery.shipped).toBe(1);
    expect(delivery.delivered).toBe(1);
  });

  it("ne rend aucun taux sans commande expediee", async () => {
    stubTables(
      [ALICE],
      [{ id: "1", reference: "A", phone: "06", status: "Nouveau", created_at: at(0) }],
      [statusEvent("1", ALICE, "Pas de rep 1", 1)]
    );
    const { agents } = await getAgentStats();
    expect(agents[0].delivery).toMatchObject({ shipped: 0, delivered: 0, rate: 0 });
  });
});

describe("administrateurs", () => {
  it("ne donne pas de fiche a un administrateur", async () => {
    stubTables(
      [ALICE, PATRON],
      [{ id: "1", reference: "A", phone: "06", status: "Confirme", created_at: at(0) }],
      [statusEvent("1", ALICE, "Confirme", 1)]
    );
    const { agents } = await getAgentStats();
    expect(agents.map((a) => a.name)).toEqual(["Alice"]);
  });

  it("rend a l'agent la commande que l'administrateur a confirmee", async () => {
    // Alice a appele, le patron n'a fait que poser le statut final.
    stubTables(
      [ALICE, PATRON],
      [{ id: "1", reference: "A", phone: "06", status: "Confirme", created_at: at(0) }],
      [
        statusEvent("1", ALICE, "Pas de rep 1", 1),
        statusEvent("1", PATRON, "Confirme", 2, "Pas de rep 1"),
      ]
    );
    const { agents } = await getAgentStats();
    const alice = agents.find((a) => a.name === "Alice")!;
    expect(alice.confirmed).toBe(1);
    expect(alice.treated).toBe(1);
  });

  it("donne au seul agent actif une commande touchee par le seul administrateur", async () => {
    stubTables(
      [ALICE, PATRON],
      [
        { id: "1", reference: "A", phone: "06", status: "Rappel", created_at: at(0) },
        { id: "2", reference: "B", phone: "06", status: "Confirme", created_at: at(0) },
      ],
      [
        statusEvent("1", ALICE, "Rappel", 1),
        statusEvent("2", PATRON, "Confirme", 2),
      ]
    );
    const { agents } = await getAgentStats();
    expect(agents.find((a) => a.name === "Alice")!.confirmed).toBe(1);
  });

  it("n'attribue pas au hasard quand deux agents travaillent", async () => {
    stubTables(
      [ALICE, BOB, PATRON],
      [
        { id: "1", reference: "A", phone: "06", status: "Rappel", created_at: at(0) },
        { id: "2", reference: "B", phone: "06", status: "Rappel", created_at: at(0) },
        { id: "3", reference: "C", phone: "06", status: "Confirme", created_at: at(0) },
      ],
      [
        statusEvent("1", ALICE, "Rappel", 1),
        statusEvent("2", BOB, "Rappel", 1),
        statusEvent("3", PATRON, "Confirme", 2),
      ]
    );
    const { agents } = await getAgentStats();
    // Aucun des deux ne recoit une commande qu'il n'a jamais vue.
    expect(agents.find((a) => a.name === "Alice")!.confirmed).toBe(0);
    expect(agents.find((a) => a.name === "Bob")!.confirmed).toBe(0);
  });
});

describe("ventilation par produit", () => {
  it("compte chaque produit separement", async () => {
    stubTables(
      [ALICE],
      [
        { id: "1", reference: "A", phone: "06", status: "Confirme", created_at: at(0),
          product_name: "Collier", tracking_number: "F-1", delivery_status_code: "DELIVERED" },
        { id: "2", reference: "B", phone: "06", status: "Pas de rep 1", created_at: at(0),
          product_name: "Collier" },
        { id: "3", reference: "C", phone: "06", status: "Confirme", created_at: at(0),
          product_name: "Bracelet", tracking_number: "F-3", delivery_status_code: "RETURNED" },
      ],
      [
        statusEvent("1", ALICE, "Confirme", 1),
        statusEvent("2", ALICE, "Pas de rep 1", 1),
        statusEvent("3", ALICE, "Confirme", 1),
      ]
    );

    const { products } = await getAgentStats();
    const collier = products.find((p) => p.product === "Collier")!;
    const bracelet = products.find((p) => p.product === "Bracelet")!;

    expect(collier).toMatchObject({ treated: 2, confirmed: 1, confirmRate: 50 });
    expect(collier.delivery).toMatchObject({ shipped: 1, delivered: 1, rate: 100 });
    expect(bracelet).toMatchObject({ treated: 1, confirmed: 1, confirmRate: 100 });
    expect(bracelet.delivery).toMatchObject({ shipped: 1, returned: 1, rate: 0 });
  });

  it("classe du plus traite au moins traite", async () => {
    stubTables(
      [ALICE],
      [
        { id: "1", reference: "A", phone: "06", status: "Nouveau", created_at: at(0), product_name: "Rare" },
        { id: "2", reference: "B", phone: "06", status: "Nouveau", created_at: at(0), product_name: "Courant" },
        { id: "3", reference: "C", phone: "06", status: "Nouveau", created_at: at(0), product_name: "Courant" },
      ],
      ["1", "2", "3"].map((id) => statusEvent(id, ALICE, "Pas de rep 1", 1))
    );
    const { products } = await getAgentStats();
    expect(products.map((p) => p.product)).toEqual(["Courant", "Rare"]);
  });

  it("regroupe sous un intitule les commandes sans produit", async () => {
    stubTables(
      [ALICE],
      [{ id: "1", reference: "A", phone: "06", status: "Nouveau", created_at: at(0), product_name: null }],
      [statusEvent("1", ALICE, "Pas de rep 1", 1)]
    );
    const { products } = await getAgentStats();
    expect(products[0].product).toBe("Sans produit");
  });
});
