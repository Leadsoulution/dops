import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Expense } from "@/lib/finance/expense-types";

const from = vi.fn();
vi.mock("./server", () => ({ getSupabaseServerClient: () => ({ from }) }));

let charges: Expense[] = [];
vi.mock("./expenses", () => ({ listExpenses: () => Promise.resolve(charges) }));

import { getFinanceOverview } from "./finance";

type Row = {
  created_at: string;
  status: string | null;
  amount: string | null;
  product_name: string | null;
  stock_items: string | null;
  tracking_number: string | null;
  delivery_status_code: string | null;
  delivery_date: string | null;
};

const PRODUITS = [
  { id: "p1", name: "Collier Arjouane", forcelog_ref: "1FKGUA" },
  { id: "p2", name: "Collier Perle", forcelog_ref: "1FKT5H" },
];

const commande = (o: Partial<Row>): Row => ({
  created_at: "2026-10-20T08:00:00.000Z",
  status: "Confirme",
  amount: "199 MAD",
  product_name: "Collier Arjouane",
  stock_items: "1FKGUA:1",
  tracking_number: "F-AAA",
  delivery_status_code: "DELIVERED",
  delivery_date: "2026-10-22 14:00",
  ...o,
});

const charge = (p: Partial<Expense>): Expense => ({
  id: p.id ?? "e1",
  type: p.type ?? "par_commande",
  label: p.label ?? "Charge",
  amount: p.amountMad ?? 0,
  currency: "MAD",
  exchangeRate: 1,
  amountMad: p.amountMad ?? 0,
  startDate: p.startDate ?? "2026-10-01",
  isActive: p.isActive ?? true,
  createdAt: "2026-10-01",
  ...p,
});

function stub(rows: Row[]) {
  from.mockImplementation((table: string) => {
    if (table === "products") {
      return { select: () => Promise.resolve({ data: PRODUITS, error: null }) };
    }
    const chain = {
      select: () => chain,
      order: () => chain,
      range: (a: number, b: number) =>
        Promise.resolve({ data: rows.slice(a, b + 1), error: null }),
    };
    return chain;
  });
}

beforeEach(() => {
  from.mockReset();
  charges = [];
});

const PERIODE = ["2026-10-01", "2026-10-31"] as const;

describe("getFinanceOverview", () => {
  it("compte comme revenu l'encaisse des commandes livrees, arrondi", async () => {
    // Le prix vendu, pas l'arrondi du livreur : 199 reste 199.
    stub([commande({}), commande({}), commande({ delivery_status_code: "DISTRIBUTION" })]);
    const f = await getFinanceOverview(...PERIODE);
    expect(f.revenue).toBe(398);
    expect(f.delivered).toBe(2);
  });

  it("ne compte pas comme revenu un colis retourne", async () => {
    stub([commande({ delivery_status_code: "RETURNED", delivery_date: null })]);
    const f = await getFinanceOverview(...PERIODE);
    expect(f.revenue).toBe(0);
    expect(f.delivered).toBe(0);
  });

  it("applique une charge par commande a chaque livraison", async () => {
    charges = [
      charge({ id: "a", amountMad: 33, appliesToStatus: "livree", label: "Livraison" }),
    ];
    stub([commande({}), commande({}), commande({ delivery_status_code: "DISTRIBUTION" })]);
    const f = await getFinanceOverview(...PERIODE);
    expect(f.expenses).toBe(66);
    expect(f.profit).toBe(332);
    expect(f.profitPerDelivered).toBe(166);
  });

  it("compte une charge a l'expedition sur tout colis parti", async () => {
    charges = [charge({ id: "b", amountMad: 3, appliesToStatus: "expediee" })];
    stub([
      commande({}),
      commande({ delivery_status_code: "DISTRIBUTION" }),
      commande({ tracking_number: null, delivery_status_code: null }),
    ]);
    const f = await getFinanceOverview(...PERIODE);
    expect(f.expenses).toBe(6);
  });

  it("ne retient que les commandes du produit vise", async () => {
    charges = [
      charge({ id: "c", amountMad: 20, appliesToStatus: "livree", productId: "p2" }),
    ];
    stub([
      commande({}),
      commande({ product_name: "Collier Perle", stock_items: "1FKT5H:1" }),
    ]);
    const f = await getFinanceOverview(...PERIODE);
    expect(f.expenses).toBe(20);
  });

  it("reconnait le produit d'une commande a plusieurs references", async () => {
    charges = [
      charge({ id: "c", amountMad: 20, appliesToStatus: "livree", productId: "p2" }),
    ];
    // Le nom enregistre est celui du premier article ; le second n'est
    // connu que par sa reference.
    stub([commande({ product_name: "Collier Arjouane", stock_items: "1FKGUA:1,1FKT5H:1" })]);
    const f = await getFinanceOverview(...PERIODE);
    expect(f.expenses).toBe(20);
  });

  it("range la commande a sa date d'arrivee, pas a celle de la remise", async () => {
    // Arrivee le 20 octobre, remise le 3 novembre : elle appartient a
    // octobre, qui l'a vendue — et novembre ne se l'attribue pas.
    stub([
      commande({
        created_at: "2026-10-20T08:00:00.000Z",
        delivery_date: "2026-11-03 10:00",
      }),
    ]);
    const octobre = await getFinanceOverview(...PERIODE);
    expect(octobre.delivered).toBe(1);
    expect(octobre.revenue).toBe(199);
    const novembre = await getFinanceOverview("2026-11-01", "2026-11-30");
    expect(novembre.delivered).toBe(0);
    expect(novembre.revenue).toBe(0);
  });

  it("ne compte rien avant le premier jour suivi", async () => {
    // La mise en place qui precede la comptabilite ne doit pas
    // remonter, meme si on demande une periode plus large.
    stub([commande({ created_at: "2026-10-10T08:00:00.000Z" })]);
    const f = await getFinanceOverview("2026-10-01", "2026-10-31", "2026-10-17");
    expect(f.from).toBe("2026-10-17");
    expect(f.delivered).toBe(0);
  });

  it("chiffre ce qui est parti sans etre encore remis", async () => {
    stub([
      commande({ delivery_status_code: "DISTRIBUTION", delivery_date: null }),
      commande({}),
      commande({ delivery_status_code: "RETURNED", delivery_date: null }),
    ]);
    const f = await getFinanceOverview(...PERIODE);
    expect(f.inTransit).toEqual({ orders: 1, amount: 199 });
  });

  it("rend un point de courbe par mois de la periode", async () => {
    stub([
      commande({ created_at: "2026-10-20T08:00:00.000Z" }),
      commande({ created_at: "2026-11-04T08:00:00.000Z" }),
    ]);
    const f = await getFinanceOverview("2026-10-01", "2026-11-30");
    expect(f.monthly.map((m) => m.month)).toEqual(["2026-10", "2026-11"]);
    expect(f.monthly[0].revenue).toBe(199);
    expect(f.monthly[1].revenue).toBe(199);
  });
});
