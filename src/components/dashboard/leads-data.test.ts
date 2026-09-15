import { describe, it, expect } from "vitest";
import { parseLeadDate, LEAD_STATUSES, tabs, matchesTab } from "./leads-data";

/**
 * La lecture des dates porte les filtres de periode. Deux formats
 * coexistent selon l'origine de la commande, et s'y tromper ferait
 * disparaitre des commandes d'un filtre sans que rien ne le signale.
 */
describe("parseLeadDate", () => {
  it("lit le format des colis importes", () => {
    expect(parseLeadDate("2026-09-11 16:12")?.toISOString().slice(0, 10)).toBe(
      "2026-09-11"
    );
  });

  it("lit le format francais des saisies dans l'application", () => {
    const d = parseLeadDate("13 sept. 2026, 14:40");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(8);
    expect(d?.getDate()).toBe(13);
  });

  it("comprend les mois ecrits en entier et sans accent", () => {
    expect(parseLeadDate("19 aout 2026, 21:59")?.getMonth()).toBe(7);
    expect(parseLeadDate("5 juillet 2026, 10:12")?.getMonth()).toBe(6);
  });

  it("renvoie null plutot qu'une date inventee", () => {
    expect(parseLeadDate("n importe quoi")).toBeNull();
    expect(parseLeadDate("")).toBeNull();
    expect(parseLeadDate(undefined)).toBeNull();
  });
});

describe("onglets", () => {
  it("place chaque statut dans au moins un onglet", () => {
    const sansOnglet = LEAD_STATUSES.filter(
      (s) => !tabs.some((t) => t.statuses?.includes(s.label))
    );
    expect(sansOnglet.map((s) => s.label)).toEqual([]);
  });

  it("l'onglet +3 jours suit le statut pose a la main", () => {
    const onglet = tabs.find((t) => t.label === "+3 jours")!;
    expect(matchesTab(onglet, "+3 jours")).toBe(true);
    expect(matchesTab(onglet, "Nouveau")).toBe(false);
  });

  it("l'onglet Tous ne rejette rien", () => {
    const tous = tabs.find((t) => t.label === "Tous")!;
    for (const s of LEAD_STATUSES) expect(matchesTab(tous, s.label)).toBe(true);
  });
});
