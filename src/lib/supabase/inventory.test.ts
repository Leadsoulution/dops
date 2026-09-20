import { describe, it, expect, vi, beforeEach } from "vitest";

const from = vi.fn();
vi.mock("./server", () => ({ getSupabaseServerClient: () => ({ from }) }));

import { getInventory, matchProduct } from "./inventory";

type P = {
  id: string; ref: string; name: string; forcelog_ref: string | null;
  image: string | null; quantity: number; stock_initial: number;
  stock_sent: number; status: string;
};
type L = {
  product_name: string | null; stock_items: string | null;
  item_count: number | null; tracking_number: string | null;
  delivery_status_code: string | null;
};

const produit = (o: Partial<P>): P => ({
  id: "p1", ref: "R1", name: "Bague", forcelog_ref: null, image: null,
  quantity: 0, stock_initial: 0, stock_sent: 0, status: "Actif", ...o,
});
const commande = (o: Partial<L>): L => ({
  product_name: "Bague", stock_items: null, item_count: 1,
  tracking_number: "F-1", delivery_status_code: null, ...o,
});

function stub(products: P[], leads: L[]) {
  from.mockImplementation((table: string) => {
    const rows = table === "products" ? products : leads;
    const sliceable = {
      order: () => sliceable,
      range: (a: number, b: number) =>
        Promise.resolve({ data: rows.slice(a, b + 1), error: null }),
    };
    return { select: () => sliceable };
  });
}

beforeEach(() => from.mockReset());

describe("getInventory", () => {
  it("dit ce que le transporteur devrait detenir, et l'ecart", async () => {
    stub(
      [produit({ stock_initial: 100, stock_sent: 70, quantity: 42 })],
      [
        commande({ delivery_status_code: "DISTRIBUTION", item_count: 3 }),
        commande({ delivery_status_code: "DELIVERED", item_count: 25 }),
        commande({ delivery_status_code: "RETURNED", item_count: 2 }),
      ]
    );

    const { totals } = await getInventory();
    expect(totals.purchased).toBe(100);
    expect(totals.delivered).toBe(25);
    // Achete moins livre : ce qui nous appartient encore.
    expect(totals.real).toBe(75);
    // Confie moins livre : ce qu'il devrait avoir en rayon.
    expect(totals.expectedAtCarrier).toBe(45);
    expect(totals.carrier).toBe(42);
    // Trois manquants : des retours qui ne sont pas revenus, ou des
    // colis encore en route.
    expect(totals.gap).toBe(3);
    expect(totals.inTransit).toBe(3);
    expect(totals.returned).toBe(2);
  });

  it("ne montre aucun ecart quand le compte du transporteur tombe juste", async () => {
    stub(
      [produit({ stock_initial: 50, stock_sent: 50, quantity: 40 })],
      [commande({ delivery_status_code: "DELIVERED", item_count: 10 })]
    );
    const { totals } = await getInventory();
    expect(totals.expectedAtCarrier).toBe(40);
    expect(totals.gap).toBe(0);
  });

  it("ne sort du stock que ce qui a un numero de suivi", async () => {
    stub(
      [produit({})],
      // Confirmee mais pas encore expediee : la marchandise est en rayon,
      // et s'y trouve deja comptee. La sortir la compterait deux fois.
      [commande({ tracking_number: null, item_count: 4 })]
    );

    const { totals } = await getInventory();
    expect(totals.inTransit).toBe(0);
  });

  it("signale les commandes dont le produit est inconnu", async () => {
    stub(
      [produit({ name: "Bague" })],
      [commande({ product_name: "Collier jamais catalogue" })]
    );

    const { unmatched, totals } = await getInventory();
    // Mieux vaut le dire que de les attribuer au hasard.
    expect(unmatched).toBe(1);
    expect(totals.inTransit).toBe(0);
  });

  it("laisse un produit archive hors de l'inventaire", async () => {
    stub([produit({ status: "Archive", stock_initial: 99 })], []);
    const { products, totals } = await getInventory();
    expect(products).toHaveLength(0);
    expect(totals.purchased).toBe(0);
  });

  it("compte une unite quand la commande n'en precise pas", async () => {
    stub([produit({})], [commande({ item_count: null })]);
    const { totals } = await getInventory();
    expect(totals.inTransit).toBe(1);
  });
});

describe("matchProduct", () => {
  const byRef = new Map([["180ZEI", "p-stock"]]);
  const byName = new Map([["bague", "p-nom"]]);

  it("prefere le code article, qui est exact", () => {
    expect(
      matchProduct({ product_name: "Bague", stock_items: "180ZEI:2" }, byRef, byName)
    ).toBe("p-stock");
  });

  it("retombe sur le nom quand il n'y a pas de code", () => {
    expect(
      matchProduct({ product_name: " BAGUE ", stock_items: null }, byRef, byName)
    ).toBe("p-nom");
  });

  it("ne devine pas quand rien ne correspond", () => {
    expect(
      matchProduct({ product_name: "Inconnu", stock_items: null }, byRef, byName)
    ).toBeNull();
  });
});
