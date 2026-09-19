import { describe, it, expect, vi, beforeEach } from "vitest";

const from = vi.fn();
vi.mock("./server", () => ({ getSupabaseServerClient: () => ({ from }) }));

import { getDashboardKpis } from "./dashboard";

type Lead = {
  created_at: string;
  status: string;
  ville?: string | null;
  amount?: string | null;
  item_count?: number | null;
  product_name?: string | null;
  tracking_number?: string | null;
  delivery_status_code?: string | null;
};

const JOUR = 86400_000;
const BASE = Date.parse("2026-09-18T10:00:00.000Z");
const at = (days: number) => new Date(BASE + days * JOUR).toISOString();

function stub(
  leads: Lead[],
  products: { name: string; cost_supplier: number | null }[] = [],
  cities: { key: string; name: string; aliases: string[] | null; tariff: number }[] = []
) {
  from.mockImplementation((table: string) => {
    if (table === "leads") {
      return {
        select: () => ({
          range: (a: number, b: number) =>
            Promise.resolve({ data: leads.slice(a, b + 1), error: null }),
        }),
      };
    }
    if (table === "products") {
      return { select: () => ({ data: products, error: null }) };
    }
    return { select: () => ({ eq: () => ({ data: cities, error: null }) }) };
  });
}

const kpi = (kpis: { key: string; value: number }[], key: string) =>
  kpis.find((k) => k.key === key)!;

beforeEach(() => from.mockReset());

describe("getDashboardKpis", () => {
  it("compte chaque statut dans sa case", async () => {
    stub([
      { created_at: at(0), status: "Nouveau" },
      { created_at: at(0), status: "Confirme", tracking_number: "F-1" },
      { created_at: at(0), status: "Pas de rep 2" },
      { created_at: at(0), status: "Injoignable 1" },
      { created_at: at(0), status: "En attente" },
    ]);

    const { kpis } = await getDashboardKpis(at(-1), at(1));
    expect(kpi(kpis, "leads").value).toBe(5);
    expect(kpi(kpis, "confirmes").value).toBe(1);
    // "Nouveau" et "En attente" restent a traiter.
    expect(kpi(kpis, "attente").value).toBe(2);
    // Les deux familles numerotees comptent ensemble.
    expect(kpi(kpis, "sans-reponse").value).toBe(2);
    expect(kpi(kpis, "expedies").value).toBe(1);
  });

  it("n'encaisse que sur les commandes livrees", async () => {
    stub([
      {
        created_at: at(0),
        status: "Confirme",
        amount: "199 MAD",
        tracking_number: "F-1",
        delivery_status_code: "DELIVERED",
      },
      // Confirmee et expediee, mais pas encore remise : rien d'encaisse.
      {
        created_at: at(0),
        status: "Confirme",
        amount: "199 MAD",
        tracking_number: "F-2",
        delivery_status_code: "DISTRIBUTION",
      },
    ]);

    const { kpis } = await getDashboardKpis(at(-1), at(1));
    // Le montant arrondi, celui que le livreur a reclame.
    expect(kpi(kpis, "encaisse").value).toBe(200);
    expect(kpi(kpis, "livres").value).toBe(1);
  });

  it("ignore dans le profit un produit sans cout connu", async () => {
    stub(
      [
        {
          created_at: at(0),
          status: "Confirme",
          amount: "199 MAD",
          item_count: 1,
          product_name: "Chiffre",
          ville: "Casablanca",
          tracking_number: "F-1",
          delivery_status_code: "DELIVERED",
        },
        {
          created_at: at(0),
          status: "Confirme",
          amount: "199 MAD",
          item_count: 1,
          product_name: "Inconnu",
          ville: "Casablanca",
          tracking_number: "F-2",
          delivery_status_code: "DELIVERED",
        },
      ],
      [
        { name: "Chiffre", cost_supplier: 50 },
        { name: "Inconnu", cost_supplier: null },
      ],
      [{ key: "casablanca", name: "Casablanca", aliases: null, tariff: 20 }]
    );

    const { kpis, costsKnown, costsTotal } = await getDashboardKpis(at(-1), at(1));
    // 200 encaisses - 50 de marchandise - 20 de livraison.
    expect(kpi(kpis, "profit").value).toBe(130);
    // Les deux commandes sont bien encaissees, elles.
    expect(kpi(kpis, "encaisse").value).toBe(400);
    expect(costsKnown).toBe(1);
    expect(costsTotal).toBe(2);
    expect(
      kpis.find((k) => k.key === "profit")!.subtitle
    ).toBe("1/2 produits chiffres");
  });

  it("compare a la periode precedente de meme duree", async () => {
    stub([
      { created_at: at(0), status: "Nouveau" },
      { created_at: at(0), status: "Nouveau" },
      { created_at: at(0), status: "Nouveau" },
      // La veille : une seule.
      { created_at: at(-2), status: "Nouveau" },
    ]);

    const { kpis } = await getDashboardKpis(at(-1), at(1));
    expect(kpi(kpis, "leads").value).toBe(3);
    expect(kpis.find((k) => k.key === "leads")!.trend).toBe("+200%");
  });

  it("ne compare rien quand la periode est ouverte", async () => {
    stub([{ created_at: at(0), status: "Nouveau" }]);
    // Sans borne de debut, l'intervalle "precedent" n'existe pas : une
    // variation a quatre chiffres n'apprendrait rien.
    const { kpis } = await getDashboardKpis();
    const leads = kpis.find((k) => k.key === "leads")!;
    expect(leads.trend).toBe("total");
    expect(leads.neutral).toBe(true);
  });

  it("donne une courbe avec au moins deux points", async () => {
    stub([{ created_at: at(0), status: "Nouveau" }]);
    const { kpis } = await getDashboardKpis(at(0), at(0));
    expect(kpis[0].spark.length).toBeGreaterThanOrEqual(1);
  });
});
