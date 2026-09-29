import { describe, it, expect } from "vitest";
import { parseLeadDate, LEAD_STATUSES, tabs, matchesTab,
  assigneeName,
  splitLeadDate,
} from "./leads-data";

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

describe("assigneeName", () => {
  it("rend le nom d'une personne", () => {
    expect(assigneeName("Centrecall")).toBe("Centrecall");
    expect(assigneeName("Amine bahazzaz")).toBe("Amine bahazzaz");
  });

  it("ne rend rien pour un automate", () => {
    // Une commande importee n'a encore ete prise par personne.
    expect(assigneeName("WooCommerce")).toBeUndefined();
    expect(assigneeName("ForceLog")).toBeUndefined();
    expect(assigneeName("Google Sheets")).toBeUndefined();
  });

  it("ne rend rien quand la commande n'a jamais ete touchee", () => {
    expect(assigneeName(undefined)).toBeUndefined();
    expect(assigneeName("")).toBeUndefined();
  });
});

describe("splitLeadDate", () => {
  it("separe le jour de l'heure", () => {
    expect(splitLeadDate("29 sept. 2026, 19:27")).toEqual({
      day: "29 sept. 2026",
      time: "19:27",
    });
  });

  it("garde le jour seul quand il n'y a pas d'heure", () => {
    // Pas d'heure inventee : une seconde ligne a "00:00" laisserait
    // croire a une commande passee a minuit pile.
    expect(splitLeadDate("29 sept. 2026")).toEqual({
      day: "29 sept. 2026",
      time: "",
    });
  });

  it("accepte les secondes et une heure a un chiffre", () => {
    expect(splitLeadDate("1 mars 2026, 9:05").time).toBe("9:05");
    expect(splitLeadDate("1 mars 2026, 09:05:31").time).toBe("09:05:31");
  });

  it("ne coupe pas sur une virgule qui n'annonce pas une heure", () => {
    expect(splitLeadDate("lundi, 29 sept. 2026")).toEqual({
      day: "lundi, 29 sept. 2026",
      time: "",
    });
  });

  it("supporte une date absente", () => {
    expect(splitLeadDate(undefined)).toEqual({ day: "", time: "" });
    expect(splitLeadDate("  ")).toEqual({ day: "", time: "" });
  });
});
