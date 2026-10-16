import { describe, expect, it } from "vitest";
import type { Expense } from "./expense-types";
import {
  adResults,
  resolveAdWindows,
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

  it("etale une campagne sur ses jours de diffusion", () => {
    // Trente mille du 1er au 30 : une semaine en coute sept trentiemes.
    const pub = charge({
      type: "publicite",
      amountMad: 30000,
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });
    expect(expenseOnPeriod(pub, [], ...periode)?.amount).toBe(30000);
    expect(expenseOnPeriod(pub, [], "2026-09-01", "2026-09-07")?.amount).toBe(7000);
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

describe("adResults", () => {
  const campagne = charge({
    id: "pub",
    type: "publicite",
    label: "Campagne septembre",
    platform: "Facebook",
    amountMad: 1000,
    startDate: "2026-09-01",
    endDate: "2026-09-10",
  });

  it("compte les commandes recues pendant la diffusion, pas celles livrees", () => {
    const faits = [
      // Recue pendant la campagne, livree apres : elle lui revient.
      commande({
        createdDay: "2026-09-08",
        deliveredDay: "2026-10-02",
        delivered: true,
        confirmed: true,
        revenue: 300,
      }),
      // Recue avant la campagne mais livree pendant : elle ne lui doit
      // rien.
      commande({
        createdDay: "2026-08-20",
        deliveredDay: "2026-09-05",
        delivered: true,
        revenue: 500,
      }),
    ];
    const [r] = adResults(faits, [campagne], "2026-10-16");
    expect(r.received).toBe(1);
    expect(r.delivered).toBe(1);
    expect(r.revenue).toBe(300);
  });

  it("deduit le budget et les charges des commandes amenees", () => {
    const faits = [
      commande({
        createdDay: "2026-09-02",
        deliveredDay: "2026-09-04",
        delivered: true,
        confirmed: true,
        revenue: 800,
      }),
      commande({ createdDay: "2026-09-03", confirmed: true }),
    ];
    const [r] = adResults(
      faits,
      [
        campagne,
        charge({ id: "liv", amountMad: 33, appliesToStatus: "livree" }),
      ],
      "2026-10-16"
    );
    expect(r.spend).toBe(1000);
    expect(r.orderCharges).toBe(33);
    expect(r.profit).toBe(800 - 1000 - 33);
    expect(r.received).toBe(2);
    expect(r.costPerOrder).toBe(500);
    expect(r.costPerDelivered).toBe(1000);
    expect(r.deliveryRate).toBe(50);
  });

  it("annonce a part les commandes dont le sort n'est pas connu", () => {
    const faits = [
      commande({ createdDay: "2026-09-02", shipped: true, confirmed: true }),
      commande({ createdDay: "2026-09-03", returned: true }),
    ];
    const [r] = adResults(faits, [campagne], "2026-10-16");
    expect(r.pending).toBe(1);
    expect(r.delivered).toBe(0);
  });

  it("court jusqu'a aujourd'hui quand la campagne n'a pas de fin", () => {
    const sansFin = charge({
      id: "pub2",
      type: "publicite",
      amountMad: 500,
      startDate: "2026-09-01",
    });
    const faits = [commande({ createdDay: "2026-10-10", confirmed: true })];
    const [r] = adResults(faits, [sansFin], "2026-10-16");
    expect(r.received).toBe(1);
    expect(r.days).toBe(46);
  });

  it("ne retient que les campagnes actives", () => {
    expect(
      adResults([], [charge({ type: "publicite", isActive: false })], "2026-10-16")
    ).toEqual([]);
  });
});

describe("resolveAdWindows", () => {
  const pub = (id: string, startDate: string, endDate?: string) =>
    charge({ id, type: "publicite", amountMad: 1000, startDate, endDate });

  it("fait courir un budget sans fin jusqu'a la veille du suivant", () => {
    const [a, b] = resolveAdWindows(
      [pub("a", "2026-09-15"), pub("b", "2026-09-18")],
      "2026-10-16"
    );
    expect(a.endDate).toBe("2026-09-17");
    expect(b.endDate).toBe("2026-10-16");
  });

  it("donne la meme fenetre a deux budgets du meme jour", () => {
    const [a, b, c] = resolveAdWindows(
      [pub("a", "2026-09-15"), pub("b", "2026-09-15"), pub("c", "2026-09-16")],
      "2026-10-16"
    );
    expect(a.endDate).toBe("2026-09-15");
    expect(b.endDate).toBe("2026-09-15");
    expect(c.endDate).toBe("2026-10-16");
  });

  it("respecte une fin saisie a la main", () => {
    const [a] = resolveAdWindows(
      [pub("a", "2026-09-15", "2026-09-16"), pub("b", "2026-09-20")],
      "2026-10-16"
    );
    expect(a.endDate).toBe("2026-09-16");
  });

  it("ne touche ni aux autres charges ni aux campagnes desactivees", () => {
    const loyer = charge({ id: "l", type: "fixe", amountMad: 3000 });
    const eteinte = charge({
      id: "x",
      type: "publicite",
      amountMad: 100,
      isActive: false,
    });
    const [a, b] = resolveAdWindows([loyer, eteinte], "2026-10-16");
    expect(a.endDate).toBeUndefined();
    expect(b.endDate).toBeUndefined();
  });

  it("repartit une suite de budgets quotidiens sans en compter deux fois", () => {
    // 500 le 15, 1000 le 18 : du 15 au 17 le budget est celui du 15.
    const resolus = resolveAdWindows(
      [
        charge({ id: "a", type: "publicite", amountMad: 600, startDate: "2026-09-15" }),
        charge({ id: "b", type: "publicite", amountMad: 1000, startDate: "2026-09-18" }),
      ],
      "2026-09-20"
    );
    const bilan = financeSummary([], resolus, "2026-09-15", "2026-09-20");
    expect(bilan.expenses).toBe(1600);
    // Le premier budget, sur sa seule premiere journee : un tiers.
    const jour1 = financeSummary([], resolus, "2026-09-15", "2026-09-15");
    expect(jour1.expenses).toBe(200);
  });
});
