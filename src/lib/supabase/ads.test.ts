import { describe, it, expect, vi, beforeEach } from "vitest";

const from = vi.fn();
vi.mock("./server", () => ({ getSupabaseServerClient: () => ({ from }) }));

import { getAdsOverview } from "./ads";

type Insight = {
  campaign_id: string; day: string; spend_mad: number;
  impressions: number; clicks: number; conversions: number; synced_at: string;
};
type Campaign = {
  id: string; platform: "meta" | "tiktok"; external_id: string;
  name: string; status: string | null; level: string;
};
type Lead = {
  created_at: string; status: string; amount: string | null;
  delivery_status_code: string | null; delivery_date: string | null;
};

const lead = (o: Partial<Lead>): Lead => ({
  created_at: "2026-09-20T10:00:00.000Z", status: "Nouveau", amount: "200 MAD",
  delivery_status_code: null, delivery_date: null, ...o,
});

function stub(insights: Insight[], campaigns: Campaign[], leads: Lead[]) {
  from.mockImplementation((table: string) => {
    const rows =
      table === "ad_insights_daily" ? insights
      : table === "ad_campaigns" ? campaigns
      : leads;
    const chain = {
      select: () => chain,
      eq: () => chain,
      gte: () => chain,
      lte: () => chain,
      range: (a: number, b: number) =>
        Promise.resolve({ data: rows.slice(a, b + 1), error: null }),
    };
    return chain;
  });
}

const CAMPAGNE: Campaign = {
  id: "c1", platform: "meta", external_id: "120210", name: "Bague - Maroc",
  status: "ACTIVE", level: "campaign",
};

beforeEach(() => from.mockReset());

describe("getAdsOverview", () => {
  it("croise la depense des plateformes avec nos commandes", async () => {
    stub(
      [{ campaign_id: "c1", day: "2026-09-20", spend_mad: 1000,
         impressions: 50000, clicks: 500, conversions: 40,
         synced_at: "2026-09-21T10:00:00.000Z" }],
      [CAMPAGNE],
      [
        // 10 commandes, dont 6 confirmees, dont 4 livrees a 200 MAD.
        ...Array.from({ length: 4 }, () =>
          lead({ status: "Confirme", delivery_status_code: "DELIVERED" })),
        lead({ status: "Confirme" }),
        lead({ status: "EXPIDER" }),
        ...Array.from({ length: 4 }, () => lead({ status: "Pas de rep 1" })),
      ]
    );

    const o = await getAdsOverview();

    // Cote plateforme.
    expect(o.spendMad).toBe(1000);
    expect(o.ctr).toBe(1);          // 500 / 50000
    expect(o.cpc).toBe(2);          // 1000 / 500
    expect(o.cpm).toBe(20);         // 1000 / 50000 x 1000

    // Cote commandes.
    expect(o.leads).toBe(10);
    expect(o.confirmed).toBe(6);
    expect(o.delivered).toBe(4);
    expect(o.revenueDelivered).toBe(800);
    expect(o.confirmRate).toBe(60);
    expect(o.deliveryRate).toBe(67); // 4 / 6

    // Les deux face a face.
    expect(o.costPerLead).toBe(100);       // 1000 / 10
    expect(o.costPerConfirmed).toBe(166.67); // 1000 / 6
    expect(o.costPerDelivered).toBe(250);  // 1000 / 4
    // 800 encaisses pour 1000 depenses : la campagne perd de l'argent.
    expect(o.roas).toBe(0.8);
  });

  it("ne compte comme chiffre d'affaires que les commandes livrees", async () => {
    stub(
      [{ campaign_id: "c1", day: "2026-09-20", spend_mad: 100, impressions: 10,
         clicks: 1, conversions: 0, synced_at: "2026-09-21T10:00:00.000Z" }],
      [CAMPAGNE],
      [
        lead({ status: "Confirme", delivery_status_code: "DELIVERED", amount: "200 MAD" }),
        // Confirmee et expediee, mais le client n'a rien paye encore.
        lead({ status: "Confirme", delivery_status_code: "DISTRIBUTION", amount: "200 MAD" }),
      ]
    );

    const o = await getAdsOverview();
    expect(o.revenueDelivered).toBe(200);
    expect(o.delivered).toBe(1);
  });

  it("ne divise jamais par zero", async () => {
    // Aucune depense, aucune commande : la page doit s'afficher quand
    // meme, avec des zeros plutot que des "Infinity" ou des "NaN".
    stub([], [], []);
    const o = await getAdsOverview();
    for (const v of [o.ctr, o.cpc, o.cpm, o.costPerLead, o.costPerDelivered, o.roas]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBe(0);
    }
  });

  it("ignore une depense dont la campagne est inconnue", async () => {
    stub(
      [{ campaign_id: "fantome", day: "2026-09-20", spend_mad: 500, impressions: 1,
         clicks: 1, conversions: 0, synced_at: "2026-09-21T10:00:00.000Z" }],
      [CAMPAGNE],
      []
    );
    const o = await getAdsOverview();
    // Mieux vaut ne pas l'afficher que de l'attribuer au hasard.
    expect(o.campaigns).toHaveLength(0);
    expect(o.spendMad).toBe(0);
  });

  it("range la depense et les livraisons par jour", async () => {
    stub(
      [
        { campaign_id: "c1", day: "2026-09-20", spend_mad: 100, impressions: 0,
          clicks: 0, conversions: 0, synced_at: "2026-09-21T10:00:00.000Z" },
        { campaign_id: "c1", day: "2026-09-21", spend_mad: 250, impressions: 0,
          clicks: 0, conversions: 0, synced_at: "2026-09-21T10:00:00.000Z" },
      ],
      [CAMPAGNE],
      [lead({ status: "Confirme", delivery_status_code: "DELIVERED",
              delivery_date: "2026-09-21 14:20" })]
    );

    const o = await getAdsOverview();
    expect(o.daily).toEqual([
      { day: "2026-09-20", spendMad: 100, delivered: 0 },
      { day: "2026-09-21", spendMad: 250, delivered: 1 },
    ]);
  });

  it("classe les campagnes par depense decroissante", async () => {
    stub(
      [
        { campaign_id: "c1", day: "2026-09-20", spend_mad: 100, impressions: 0,
          clicks: 0, conversions: 0, synced_at: "2026-09-21T10:00:00.000Z" },
        { campaign_id: "c2", day: "2026-09-20", spend_mad: 900, impressions: 0,
          clicks: 0, conversions: 0, synced_at: "2026-09-21T10:00:00.000Z" },
      ],
      [CAMPAGNE, { ...CAMPAGNE, id: "c2", external_id: "120211", name: "Collier",
                   platform: "tiktok" }],
      []
    );
    const o = await getAdsOverview();
    expect(o.campaigns.map((c) => c.name)).toEqual(["Collier", "Bague - Maroc"]);
  });
});
