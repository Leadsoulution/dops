import { describe, it, expect, vi, beforeEach } from "vitest";

const from = vi.fn();
vi.mock("./server", () => ({ getSupabaseServerClient: () => ({ from }) }));

import { getInventory } from "./inventory";

type P = {
  id: string; ref: string; name: string; forcelog_ref: string | null;
  image: string | null; quantity: number; stock_sent: number; status: string;
};
type L = {
  id: string; reference: string; client: string;
  product_name: string | null; stock_items: string | null;
  item_count: number | null; tracking_number: string | null;
  delivery_status: string | null; delivery_status_code: string | null;
  delivery_date: string | null; restocked_at: string | null;
};

const produit = (o: Partial<P>): P => ({
  id: "p1", ref: "R1", name: "Bague", forcelog_ref: "1FKGUA", image: null,
  quantity: 0, stock_sent: 0, status: "Actif", ...o,
});

let n = 0;
const commande = (o: Partial<L>): L => ({
  id: `l${++n}`, reference: `WC-${n}`, client: "Client",
  product_name: "Bague", stock_items: "1FKGUA:1", item_count: 1,
  tracking_number: "F-1", delivery_status: null, delivery_status_code: null,
  delivery_date: null, restocked_at: null, ...o,
});

function stub(products: P[], leads: L[]) {
  from.mockImplementation((table: string) => {
    const rows = table === "products" ? products : leads;
    const chain = {
      select: () => chain,
      order: () => chain,
      range: (a: number, b: number) =>
        Promise.resolve({ data: rows.slice(a, b + 1), error: null }),
    };
    return chain;
  });
}

beforeEach(() => from.mockReset());

describe("getInventory", () => {
  it("calcule le reel comme le recu moins le livre", async () => {
    stub(
      [produit({ stock_sent: 100, quantity: 60 })],
      [
        commande({ delivery_status_code: "DELIVERED", stock_items: "1FKGUA:25" }),
        commande({ delivery_status_code: "DISTRIBUTION", stock_items: "1FKGUA:5" }),
      ]
    );

    const { totals } = await getInventory();
    expect(totals.received).toBe(100);
    expect(totals.delivered).toBe(25);
    // Recu moins livre, et rien d'autre.
    expect(totals.real).toBe(75);
    expect(totals.carrier).toBe(60);
    expect(totals.gap).toBe(15);
    expect(totals.inTransit).toBe(5);
  });

  it("compte deux unites du meme produit dans un seul colis", async () => {
    // WC-503 : "1FKGUA:2" doit compter deux, pas un.
    stub(
      [produit({ stock_sent: 10 })],
      [commande({ delivery_status_code: "DELIVERED", stock_items: "1FKGUA:2" })]
    );
    const { totals } = await getInventory();
    expect(totals.delivered).toBe(2);
    expect(totals.real).toBe(8);
  });

  it("repartit un colis portant deux produits differents", async () => {
    // MO-DFPEI-0923 : sans repartition, les deux unites allaient au
    // premier produit et le second n'en recevait aucune.
    stub(
      [
        produit({ id: "p1", forcelog_ref: "1FKT5H", name: "Perle", stock_sent: 10 }),
        produit({ id: "p2", forcelog_ref: "1FL5NX", name: "Rose", stock_sent: 10 }),
      ],
      [
        commande({
          delivery_status_code: "DELIVERED",
          stock_items: "1FKT5H:1,1FL5NX:1",
          item_count: 2,
        }),
      ]
    );

    const { products, totals } = await getInventory();
    const perle = products.find((p) => p.id === "p1")!;
    const rose = products.find((p) => p.id === "p2")!;
    expect(perle.delivered).toBe(1);
    expect(rose.delivered).toBe(1);
    expect(perle.real).toBe(9);
    expect(rose.real).toBe(9);
    expect(totals.delivered).toBe(2);
  });

  it("ne sort du stock que ce qui a un numero de suivi", async () => {
    stub(
      [produit({ stock_sent: 10 })],
      // Confirmee mais pas expediee : la marchandise est encore chez eux.
      [commande({ tracking_number: null, stock_items: "1FKGUA:4" })]
    );
    const { totals } = await getInventory();
    expect(totals.delivered).toBe(0);
    expect(totals.inTransit).toBe(0);
    expect(totals.real).toBe(10);
  });

  it("range les retours a part, sans les retirer du reel", async () => {
    stub(
      [produit({ stock_sent: 10, quantity: 9 })],
      [commande({ delivery_status_code: "RETURNED", stock_items: "1FKGUA:1" })]
    );
    const { totals, returns } = await getInventory();
    expect(totals.returned).toBe(1);
    // Un retour n'est pas une livraison : le reel ne bouge pas.
    expect(totals.delivered).toBe(0);
    expect(totals.real).toBe(10);
    expect(returns).toHaveLength(1);
  });

  it("retombe sur le nom quand le colis n'a pas de detail", async () => {
    stub(
      [produit({ stock_sent: 10, name: "Bague" })],
      [
        commande({
          delivery_status_code: "DELIVERED",
          stock_items: null,
          product_name: "Bague",
          item_count: 3,
        }),
      ]
    );
    const { totals } = await getInventory();
    expect(totals.delivered).toBe(3);
  });

  it("signale les unites dont la reference est inconnue", async () => {
    stub(
      [produit({ forcelog_ref: "1FKGUA" })],
      [commande({ delivery_status_code: "DELIVERED", stock_items: "REF_INCONNUE:2" })]
    );
    const { unmatched, totals } = await getInventory();
    // Mieux vaut le dire que de les attribuer au hasard.
    expect(unmatched).toBe(2);
    expect(totals.delivered).toBe(0);
  });

  it("laisse un produit archive hors de l'inventaire", async () => {
    stub([produit({ status: "Archive", stock_sent: 99 })], []);
    const { products, totals } = await getInventory();
    expect(products).toHaveLength(0);
    expect(totals.received).toBe(0);
  });
});
