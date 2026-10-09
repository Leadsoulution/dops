import { describe, expect, it } from "vitest";
import {
  COST_PER_RESULT_KEY,
  METRICS,
  RESULTS_KEY,
  RESULT_METRICS,
  SPEND_KEY,
  resultLabel,
  resultTotal,
  withResultTotal,
  availableMetrics,
  formatMetric,
  metricValue,
  sumMetrics,
} from "./metrics";

const trouve = (key: string) => METRICS.find((m) => m.key === key)!;

describe("sumMetrics", () => {
  it("additionne ce qui s'additionne", () => {
    expect(
      sumMetrics([
        { impressions: 100, clicks: 5 },
        { impressions: 250, clicks: 7 },
      ])
    ).toEqual({ impressions: 350, clicks: 12 });
  });

  it("jette les taux au lieu de les additionner", () => {
    // Deux CTR de 4 % ne font pas 8 %. Ils seront recalcules.
    const total = sumMetrics([
      { impressions: 100, clicks: 4, ctr: 4 },
      { impressions: 100, clicks: 4, ctr: 4 },
    ]);
    expect(total.ctr).toBeUndefined();
    expect(total).toEqual({ impressions: 200, clicks: 8 });
  });

  it("jette aussi les couts par action, qui sont des rapports", () => {
    const total = sumMetrics([{ "action:lead": 2, "cost:lead": 15 }]);
    expect(total["action:lead"]).toBe(2);
    expect(total["cost:lead"]).toBeUndefined();
  });

  it("supporte des releves absents", () => {
    expect(sumMetrics([null, undefined, { clicks: 3 }])).toEqual({ clicks: 3 });
  });
});

describe("metricValue", () => {
  it("rend la somme telle quelle", () => {
    expect(metricValue(trouve("impressions"), { impressions: 350 })).toBe(350);
  });

  it("recalcule un taux depuis ses deux termes", () => {
    // 8 clics sur 200 impressions : 4 %, et non la somme des taux.
    expect(metricValue(trouve("ctr"), { clicks: 8, impressions: 200 })).toBe(4);
  });

  it("applique le facteur d'echelle du CPM", () => {
    expect(
      metricValue(trouve("cpm"), { [SPEND_KEY]: 20, impressions: 10000 })
    ).toBe(2);
  });

  it("recalcule la frequence, qui n'est pas une moyenne de moyennes", () => {
    expect(metricValue(trouve("frequency"), { impressions: 300, reach: 100 })).toBe(3);
  });

  it("rend zero quand le denominateur manque, jamais l'infini", () => {
    // Une campagne sans clic n'a pas un cout par clic infini.
    expect(metricValue(trouve("cpc"), { [SPEND_KEY]: 50, clicks: 0 })).toBe(0);
    expect(metricValue(trouve("cpc"), { [SPEND_KEY]: 50 })).toBe(0);
  });
});

describe("availableMetrics", () => {
  it("ne propose que les actions que le compte a produites", () => {
    const cols = availableMetrics([{ "action:link_click": 85 }]);
    const cles = cols.map((c) => c.key);
    expect(cles).toContain("action:link_click");
    expect(cles).toContain("cost:link_click");
    expect(cles).not.toContain("action:purchase");
  });

  it("garde toujours les colonnes standard", () => {
    expect(availableMetrics([]).map((c) => c.key)).toContain("cpm");
  });

  it("traduit les actions connues", () => {
    const col = availableMetrics([{ "action:landing_page_view": 1 }]).find(
      (c) => c.key === "action:landing_page_view"
    );
    expect(col?.label).toBe("Vues de page de destination");
  });
});

describe("formatMetric", () => {
  it("met l'unite qui convient", () => {
    expect(formatMetric(trouve("cpc"), 1.5)).toBe("1,50 DH");
    expect(formatMetric(trouve("ctr"), 4)).toBe("4,00 %");
    expect(formatMetric(trouve("frequency"), 1.234)).toBe("1,23");
    // Le separateur de milliers francais est une espace insecable
    // etroite : on compare a ce que produit Intl, pas a une espace
    // ordinaire tapee au clavier.
    expect(formatMetric(trouve("impressions"), 1234.6)).toBe(
      new Intl.NumberFormat("fr-FR").format(1235)
    );
  });
});

describe("resultats", () => {
  it("additionne les resultats quel que soit leur indicateur", () => {
    expect(
      resultTotal({ "result:purchase": 5, "result:post_engagement": 3 })
    ).toBe(8);
  });

  it("nomme l'indicateur quand il n'y en a qu'un", () => {
    expect(resultLabel({ "result:offsite_conversion.fb_pixel_purchase": 2 })).toBe(
      "Achats (pixel)"
    );
  });

  it("dit 'plusieurs conversions' quand ils different, comme Meta", () => {
    // Un achat et une visite de profil ne sont pas la meme grandeur :
    // le total les compte sans pretendre qu'ils sont comparables.
    expect(
      resultLabel({ "result:purchase": 2, "result:total_profile_visits": 91 })
    ).toBe("Plusieurs conversions");
  });

  it("ne dit rien quand il n'y a aucun resultat", () => {
    expect(resultLabel({ clicks: 10 })).toBe("");
  });

  it("pose le total sous une cle fixe, pour le cout par resultat", () => {
    // Le cout se calcule sur la depense d'origine, pas sur sa
    // conversion : c'est ce chiffre qu'on compare au gestionnaire de
    // publicites, et des dirhams a cote de dollars ne se comparent pas.
    const sac = withResultTotal({ "result:purchase": 4, spend_src: 200 });
    expect(sac[RESULTS_KEY]).toBe(4);
    const cout = RESULT_METRICS.find((m) => m.key === COST_PER_RESULT_KEY)!;
    expect(metricValue(cout, sac)).toBe(50);
  });

  it("exprime le cout par resultat dans la devise du compte", () => {
    const cout = availableMetrics([{ "result:purchase": 1 }], "CAD").find(
      (m) => m.key === COST_PER_RESULT_KEY
    )!;
    expect(formatMetric(cout, 12.5)).toBe("12,50 CAD");
  });

  it("retombe sur le dirham quand la devise est inconnue", () => {
    const cout = availableMetrics([{ "result:purchase": 1 }]).find(
      (m) => m.key === COST_PER_RESULT_KEY
    )!;
    expect(formatMetric(cout, 12.5)).toBe("12,50 DH");
  });

  it("laisse le sac intact quand il n'y a pas de resultat", () => {
    const sac = { clicks: 3 };
    expect(withResultTotal(sac)).toBe(sac);
  });

  it("n'offre les colonnes de resultat que si le compte en produit", () => {
    expect(availableMetrics([{ clicks: 1 }]).map((m) => m.key)).not.toContain(
      RESULTS_KEY
    );
    expect(
      availableMetrics([{ "result:purchase": 1 }]).map((m) => m.key)
    ).toContain(RESULTS_KEY);
  });
});
