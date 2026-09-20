import { describe, it, expect, vi, beforeEach } from "vitest";

const from = vi.fn();
vi.mock("./server", () => ({ getSupabaseServerClient: () => ({ from }) }));

import { getInventory, matchProduct } from "./inventory";

type P = {
  id: string; ref: string; name: string; forcelog_ref: string | null;
  image: string | null; quantity: number; stock_initial: number;
  stock_depot: number; status: string;
};
type L = {
  product_name: string | null; stock_items: string | null;
  item_count: number | null; tracking_number: string | null;
  delivery_status_code: string | null;
};

const produit = (o: Partial<P>): P => ({
  id: "p1", ref: "R1", name: "Bague", forcelog_ref: null, image: null,
  quantity: 0, stock_initial: 0, stock_depot: 0, status: "Actif", ...o,
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
  it("additionne le depot, le transporteur et ce qui roule", async () => {
    stub(
      [produit({ stock_initial: 100, stock_depot: 12, quantity: 30 })],
      [
        // En route : le colis existe et n'est pas arrive.
        commande({ delivery_status_code: "DISTRIBUTION", item_count: 3 }),
        // Livre : parti pour de bon, il ne reste nulle part.
        commande({ delivery_status_code: "DELIVERED", item_count: 5 }),
        // Retour : compte a part, le transporteur le remettra en stock.
        commande({ delivery_status_code: "RETURNED", item_count: 2 }),
      ]
    );

    const { totals } = await getInventory();
    expect(totals.initial).toBe(100);
    expect(totals.depot).toBe(12);
    expect(totals.carrier).toBe(30);
    expect(totals.inTransit).toBe(3);
    expect(totals.delivered).toBe(5);
    expect(totals.returned).toBe(2);
    // 12 + 30 + 3 : le livre et le retour n'y sont pas.
    expect(totals.remaining).toBe(45);
  });

  it("ne sort du stock que ce qui a un numero de suivi", async () => {
    stub(
      [produit({ stock_depot: 10 })],
      // Confirmee mais pas encore expediee : la marchandise est en rayon,
      // et s'y trouve deja comptee. La sortir la compterait deux fois.
      [commande({ tracking_number: null, item_count: 4 })]
    );

    const { totals } = await getInventory();
    expect(totals.inTransit).toBe(0);
    expect(totals.remaining).toBe(10);
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
    stub([produit({ status: "Archive", stock_depot: 99 })], []);
    const { products, totals } = await getInventory();
    expect(products).toHaveLength(0);
    expect(totals.remaining).toBe(0);
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
