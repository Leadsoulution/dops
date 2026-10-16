import { describe, expect, it } from "vitest";
import type { Expense } from "./expense-types";
import {
  expenseOnPeriod,
  financeSummary,
  monthlyBreakdown,
  monthsIn,
  overlapDays,
  type OrderFact,
} from "./profit";

const charge = (p: Partial<Expense>): Expense => ({
  id: p.id ?? "e1",
  type: p.type ?? "par_commande",
  label: p.label ?? "Charge",
  amount: p.amount ?? 0,
  currency: "MAD",
  exchangeRate: 1,
  amountMad: p.amountMad ?? p.amount ?? 0,
  startDate: p.startDate ?? "2026-09-01",
  isActive: p.isActive ?? true,
  createdAt: "2026-09-01",
  ...p,
});

const commande = (p: Partial<OrderFact>): OrderFact => ({
  createdDay: p.createdDay ?? "2026-09-10",
  confirmed: p.confirmed ?? false,
  shipped: p.shipped ?? false,
  delivered: p.delivered ?? false,
  returned: p.returned ?? false,
  productIds: p.productIds ?? [],
  revenue: p.revenue ?? 0,
  ...p,
});

const LIVREE = commande({
  createdDay: "2026-09-10",
  deliveredDay: "2026-09-12",
  confirmed: true,
  shipped: true,
  delivered: true,
  revenue: 200,
});

describe("overlapDays", () => {
  it("compte les bornes", () => {
    expect(overlapDays("2026-09-01", "2026-09-30", "2026-09-01", "2026-09-30")).toBe(30);
    expect(overlapDays("2026-09-01", "2026-09-30", "2026-09-15", "2026-12-31")).toBe(16);
  });

  it("rend zero quand les periodes ne se touchent pas", () => {
    expect(overlapDays("2026-09-01", "2026-09-30", "2026-10-01", "2026-10-31")).toBe(0);
  });
});

describe("monthsIn", () => {
  it("enumere les mois d'une periode, changement d'annee compris", () => {
    expect(monthsIn("2026-11-15", "2027-02-03")).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });

  it("rend le mois unique d'une periode courte", () => {
    expect(monthsIn("2026-09-02", "2026-09-04")).toEqual(["2026-09"]);
  });
});

describe("expenseOnPeriod", () => {
  const periode = ["2026-09-01", "2026-09-30"] as const;

  it("multiplie une charge par commande par les commandes declenchantes", () => {
    const ligne = expenseOnPeriod(
      charge({ type: "par_commande", amountMad: 33, appliesToStatus: "livree" }),
      [LIVREE, LIVREE, commande({ shipped: true })],
      ...periode
    );
    expect(ligne).toMatchObject({ orders: 2, unit: 33, amount: 66 });
  });

  it("date une charge de livraison au jour de la remise", () => {
    // Commandee en aout, livree en septembre : c'est septembre qui paie.
    const faits = [
      commande({
        createdDay: "2026-08-28",
        deliveredDay: "2026-09-02",
        delivered: true,
        revenue: 200,
      }),
    ];
    expect(
      expenseOnPeriod(
        charge({ type: "par_commande", amountMad: 33, appliesToStatus: "livree" }),
        faits,
        ...periode
      )?.orders
    ).toBe(1);
    expect(
      expenseOnPeriod(
        charge({ type: "par_commande", amountMad: 33, appliesToStatus: "livree" }),
        faits,
        "2026-08-01",
        "2026-08-31"
      )
    ).toBeNull();
  });

  it("ne compte pas une commande anterieure au debut de la charge", () => {
    // La charge commence le 20, la commande est livree le 12 : elle ne
    // la declenche pas, et la ligne ne pese rien.
    const ligne = expenseOnPeriod(
      charge({
        type: "par_commande",
        amountMad: 10,
        appliesToStatus: "livree",
        startDate: "2026-09-20",
      }),
      [LIVREE],
      ...periode
    );
    expect(ligne).toMatchObject({ orders: 0, amount: 0 });
  });

  it("ne retient que les commandes du produit vise", () => {
    const ligne = expenseOnPeriod(
      charge({
        type: "par_commande",
        amountMad: 5,
        appliesToStatus: "livree",
        productId: "p1",
      }),
      [
        { ...LIVREE, productIds: ["p1"] },
        { ...LIVREE, productIds: ["p2"] },
      ],
      ...periode
    );
    expect(ligne).toMatchObject({ orders: 1, amount: 5 });
  });

  it("proratise un loyer commence en cours de mois", () => {
    // Du 16 au 30 septembre : quinze jours sur trente.
    const ligne = expenseOnPeriod(
      charge({
        type: "fixe",
        amountMad: 3000,
        periodicity: "mensuelle",
        startDate: "2026-09-16",
      }),
      [],
      ...periode
    );
    expect(ligne?.amount).toBe(1500);
  });

  it("ramene une charge annuelle au mois", () => {
    const ligne = expenseOnPeriod(
      charge({
        type: "fixe",
        amountMad: 1200,
        periodicity: "annuelle",
        startDate: "2026-01-01",
      }),
      [],
      ...periode
    );
    expect(ligne?.amount).toBe(100);
  });

  it("compte une publicite une seule fois, le jour engage", () => {
    const pub = charge({
      type: "publicite",
      amountMad: 30000,
      startDate: "2026-09-14",
    });
    expect(expenseOnPeriod(pub, [], ...periode)?.amount).toBe(30000);
    // Le mois suivant ne la repaie pas.
    expect(expenseOnPeriod(pub, [], "2026-10-01", "2026-10-31")).toBeNull();
  });

  it("ignore une charge desactivee", () => {
    expect(
      expenseOnPeriod(
        charge({ type: "ponctuelle", amountMad: 500, isActive: false }),
        [],
        ...periode
      )
    ).toBeNull();
  });
});

describe("financeSummary", () => {
  const faits = [
    LIVREE,
    { ...LIVREE, revenue: 300 },
    commande({ shipped: true, confirmed: true, createdDay: "2026-09-11" }),
  ];
  const charges = [
    charge({ id: "a", type: "par_commande", amountMad: 33, appliesToStatus: "livree" }),
    charge({ id: "b", type: "par_commande", amountMad: 3, appliesToStatus: "expediee" }),
    charge({ id: "c", type: "publicite", amountMad: 100, startDate: "2026-09-14" }),
  ];

  it("fait le compte du revenu, des charges et du profit", () => {
    const bilan = financeSummary(faits, charges, "2026-09-01", "2026-09-30");
    expect(bilan.revenue).toBe(500);
    expect(bilan.delivered).toBe(2);
    // 33 x 2 livrees + 3 x 3 expediees + 100 de publicite.
    expect(bilan.expenses).toBe(175);
    expect(bilan.profit).toBe(325);
    expect(bilan.profitPerDelivered).toBe(162.5);
    expect(bilan.margin).toBe(65);
  });

  it("range les charges par nature", () => {
    const bilan = financeSummary(faits, charges, "2026-09-01", "2026-09-30");
    expect(bilan.byType.par_commande).toBe(75);
    expect(bilan.byType.publicite).toBe(100);
    expect(bilan.byType.fixe).toBe(0);
  });

  it("classe les lignes de la plus lourde a la plus legere", () => {
    const bilan = financeSummary(faits, charges, "2026-09-01", "2026-09-30");
    expect(bilan.lines.map((l) => l.id)).toEqual(["c", "a", "b"]);
  });

  it("ne divise pas par zero sans livraison", () => {
    const bilan = financeSummary([], charges, "2026-09-01", "2026-09-30");
    expect(bilan.revenue).toBe(0);
    expect(bilan.profitPerDelivered).toBe(0);
    expect(bilan.margin).toBe(0);
    expect(bilan.profit).toBe(-100);
  });

  it("annonce un profit negatif quand les charges depassent le revenu", () => {
    const bilan = financeSummary(
      [LIVREE],
      [charge({ type: "publicite", amountMad: 1000, startDate: "2026-09-02" })],
      "2026-09-01",
      "2026-09-30"
    );
    expect(bilan.profit).toBe(-800);
    expect(bilan.profitPerDelivered).toBe(-800);
  });
});

describe("monthlyBreakdown", () => {
  it("rend un point par mois, chacun avec ses propres charges", () => {
    const faits = [
      { ...LIVREE, deliveredDay: "2026-09-12", revenue: 200 },
      {
        ...LIVREE,
        createdDay: "2026-10-01",
        deliveredDay: "2026-10-03",
        revenue: 300,
      },
    ];
    const serie = monthlyBreakdown(
      faits,
      [charge({ type: "par_commande", amountMad: 50, appliesToStatus: "livree" })],
      ["2026-09", "2026-10"]
    );
    expect(serie).toEqual([
      { month: "2026-09", revenue: 200, expenses: 50, profit: 150 },
      { month: "2026-10", revenue: 300, expenses: 50, profit: 250 },
    ]);
  });
});
