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
  id: string; reference: string; client: string;
  product_name: string | null; stock_items: string | null;
  item_count: number | null; tracking_number: string | null;
  delivery_status: string | null; delivery_status_code: string | null;
  delivery_date: string | null; parcel_type: string | null;
  restocked_at: string | null;
};

const produit = (o: Partial<P>): P => ({
  id: "p1", ref: "R1", name: "Bague", forcelog_ref: null, image: null,
  quantity: 0, stock_initial: 0, stock_sent: 0, status: "Actif", ...o,
});
let n = 0;
const commande = (o: Partial<L>): L => ({
  id: `l${++n}`, reference: `WC-${n}`, client: "Client",
  product_name: "Bague", stock_items: null, item_count: 1,
  tracking_number: "F-1", delivery_status: null, delivery_status_code: null,
  delivery_date: null, parcel_type: "stock", restocked_at: null, ...o,
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
    // Confie, moins le livre, ce qui roule et le retour a rentrer :
    // 70 - 25 - 3 - 2.
    expect(totals.expectedAtCarrier).toBe(40);
    expect(totals.carrier).toBe(42);
    // Il en declare deux de plus : un retour est rentre sans avoir ete
    // pointe, ou un envoi manque a la saisie.
    expect(totals.gap).toBe(-2);
    expect(totals.inTransit).toBe(3);
    expect(totals.returned).toBe(2);
    expect(totals.awaitingRestock).toBe(2);
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

  it("retire du stock attendu ce qui roule et les retours non rentres", async () => {
    stub(
      [produit({ stock_sent: 70, quantity: 40 })],
      [
        commande({ delivery_status_code: "DELIVERED", item_count: 25 }),
        commande({ delivery_status_code: "DISTRIBUTION", item_count: 3 }),
        // Revenu mais pas encore remis en rayon : sa marchandise n'est
        // pas chez le transporteur non plus.
        commande({ delivery_status_code: "RETURNED", item_count: 2 }),
      ]
    );

    const { totals } = await getInventory();
    expect(totals.awaitingRestock).toBe(2);
    // 70 - 25 livres - 3 en route - 2 a rentrer.
    expect(totals.expectedAtCarrier).toBe(40);
    // Le transporteur en declare 40 : rien ne manque.
    expect(totals.gap).toBe(0);
  });

  it("rend sa place au retour une fois pointe", async () => {
    stub(
      [produit({ stock_sent: 10, quantity: 8 })],
      [
        commande({
          delivery_status_code: "RETURNED",
          item_count: 2,
          restocked_at: "2026-09-20T10:00:00.000Z",
        }),
      ]
    );

    const { totals } = await getInventory();
    // Pointe : le transporteur devrait l'avoir remis en rayon, donc les
    // 10 confies sont censes y etre entiers.
    expect(totals.awaitingRestock).toBe(0);
    expect(totals.expectedAtCarrier).toBe(10);
    // Il n'en declare que 8 : deux ont disparu pour de bon.
    expect(totals.gap).toBe(2);
  });

  it("liste chaque retour, ceux a pointer en tete", async () => {
    stub(
      [produit({})],
      [
        commande({
          delivery_status_code: "REFUSE",
          delivery_status: "Refuse",
          restocked_at: "2026-09-20T10:00:00.000Z",
        }),
        commande({ delivery_status_code: "RETURNED", delivery_status: "Retourne" }),
        commande({ delivery_status_code: "DELIVERED" }),
      ]
    );

    const { returns } = await getInventory();
    // Le livre n'est pas un retour.
    expect(returns).toHaveLength(2);
    // Ce qui reste a faire passe devant ce qui est fait.
    expect(returns[0].restockedAt).toBeUndefined();
    expect(returns[0].status).toBe("Retourne");
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
