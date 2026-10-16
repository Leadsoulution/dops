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
  created_at: "2026-09-10T08:00:00.000Z",
  status: "Confirme",
  amount: "199 MAD",
  product_name: "Collier Arjouane",
  stock_items: "1FKGUA:1",
  tracking_number: "F-AAA",
  delivery_status_code: "DELIVERED",
  delivery_date: "2026-09-12 14:00",
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
  startDate: p.startDate ?? "2026-09-01",
  isActive: p.isActive ?? true,
  createdAt: "2026-09-01",
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

const PERIODE = ["2026-09-01", "2026-09-30"] as const;

describe("getFinanceOverview", () => {
  it("compte comme revenu l'encaisse des commandes livrees, arrondi", async () => {
    // 199 s'arrondit a 200 : c'est la somme que le livreur reclame.
    stub([commande({}), commande({}), commande({ delivery_status_code: "DISTRIBUTION" })]);
    const f = await getFinanceOverview(...PERIODE);
    expect(f.revenue).toBe(400);
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
    expect(f.profit).toBe(334);
    expect(f.profitPerDelivered).toBe(167);
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

  it("date la livraison au jour du transporteur, pas a celui du serveur", async () => {
    // Livree le 1er octobre a 00h30 heure du Maroc : la commande sort
    // de septembre, quel que soit le fuseau de la machine qui lit.
    stub([commande({ delivery_date: "2026-10-01 00:30" })]);
    const f = await getFinanceOverview(...PERIODE);
    expect(f.delivered).toBe(0);
    const octobre = await getFinanceOverview("2026-10-01", "2026-10-31");
    expect(octobre.delivered).toBe(1);
  });

  it("chiffre ce qui est parti sans etre encore remis", async () => {
    stub([
      commande({ delivery_status_code: "DISTRIBUTION", delivery_date: null }),
      commande({}),
      commande({ delivery_status_code: "RETURNED", delivery_date: null }),
    ]);
    const f = await getFinanceOverview(...PERIODE);
    expect(f.inTransit).toEqual({ orders: 1, amount: 200 });
  });

  it("rend un point de courbe par mois de la periode", async () => {
    stub([commande({}), commande({ delivery_date: "2026-10-05 10:00" })]);
    const f = await getFinanceOverview("2026-09-01", "2026-10-31");
    expect(f.monthly.map((m) => m.month)).toEqual(["2026-09", "2026-10"]);
    expect(f.monthly[0].revenue).toBe(200);
    expect(f.monthly[1].revenue).toBe(200);
  });
});
