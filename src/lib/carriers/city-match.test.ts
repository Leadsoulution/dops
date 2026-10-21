import { describe, expect, it } from "vitest";
import { cityAliases, matchCities, normalizeCity } from "./city-match";

/* Les noms viennent du referentiel reel de Speedaf, lu sur leur
 * environnement de test. */
const SPEEDAF = [
  { code: "MAC00039", name: "CASABLANCA", parentName: "CASABLANCA - SETTAT" },
  { code: "MAC02428", name: "CASABLANCA AEROPORT MOHAMED V TERMINAL 2" },
  { code: "MAC02404", name: "CASA - MAARIF EXTENSION" },
  { code: "MAR00025", name: "BENI MELLAL - KHENIFRA" },
  { code: "MAC00100", name: "Azilal" },
];

describe("normalizeCity", () => {
  it("ramene les ecritures a une seule forme", () => {
    expect(normalizeCity("Béni-Mellal")).toBe("beni_mellal");
    expect(normalizeCity("  BENI MELLAL  ")).toBe("beni_mellal");
  });
});

describe("cityAliases", () => {
  it("retient le nom entier et ses moities", () => {
    expect(cityAliases("BENI MELLAL - KHENIFRA")).toEqual([
      "beni_mellal_khenifra",
      "beni_mellal",
      "khenifra",
    ]);
  });

  it("ignore les fragments trop courts pour designer une ville", () => {
    expect(cityAliases("CASA - MAARIF")).toEqual(["casa_maarif", "casa", "maarif"]);
  });
});

describe("matchCities", () => {
  it("rapproche nos villes de leurs ecritures", () => {
    const { matched } = matchCities(
      [
        { key: "casablanca", name: "Casablanca" },
        { key: "azilal", name: "Azilal" },
        { key: "khenifra", name: "Khenifra" },
      ],
      SPEEDAF
    );
    expect(matched.get("casablanca")?.code).toBe("MAC00039");
    expect(matched.get("azilal")?.code).toBe("MAC00100");
    expect(matched.get("khenifra")?.code).toBe("MAR00025");
  });

  it("prefere la ville a son terminal d'aeroport", () => {
    // Deux entrees commencent par "CASABLANCA" : la plus courte est la
    // ville, l'autre un point de depot.
    const { matched } = matchCities([{ key: "casablanca", name: "CASABLANCA" }], SPEEDAF);
    expect(matched.get("casablanca")?.name).toBe("CASABLANCA");
  });

  it("garde la region, exigee a la creation du colis", () => {
    const { matched } = matchCities([{ key: "casablanca", name: "Casablanca" }], SPEEDAF);
    expect(matched.get("casablanca")?.parentName).toBe("CASABLANCA - SETTAT");
  });

  it("accepte un alias de notre dictionnaire", () => {
    const { matched } = matchCities(
      [{ key: "maarif", name: "Maarif", aliases: ["MAARIF EXTENSION"] }],
      SPEEDAF
    );
    expect(matched.get("maarif")?.code).toBe("MAC02404");
  });

  it("laisse de cote ce qu'il ne reconnait pas, sans deviner", () => {
    // Une ville desservie par l'un et pas par l'autre doit se voir,
    // pas se faire rattacher a sa voisine.
    const { matched, sansCorrespondance } = matchCities(
      [{ key: "mireleft", name: "Mireleft" }],
      SPEEDAF
    );
    expect(matched.size).toBe(0);
    expect(sansCorrespondance).toEqual(["mireleft"]);
  });
});
