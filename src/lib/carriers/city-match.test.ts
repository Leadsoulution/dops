import { describe, expect, it } from "vitest";
import {
  cityAliases,
  matchCities,
  normalizeCity,
  uneSeuleEcriture,
} from "./city-match";

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

describe("les autres ecritures du transporteur", () => {
  /*
   * Speedaf nomme le meme lieu de cinq facons : KELAAT M'GOUNA en
   * capitales, "Kelaat MGouna" en anglais, "Kelâat M'Gouna" en
   * francais — c'est celle-la que son application affiche. Ne
   * comparer que la premiere laissait la ville introuvable.
   */
  it("reconnait une ville par une de ses autres ecritures", () => {
    const { matched } = matchCities(
      [{ key: "kelaat_mgouna", name: "Kelaat MGouna" }],
      [
        {
          code: "MAA03569",
          name: "KELAAT M'GOUNA",
          parentName: "Draa - Tafilalet",
          autresNoms: ["Kelaat MGouna", "Kelâat M'Gouna"],
        },
      ]
    );
    expect(matched.get("kelaat_mgouna")?.code).toBe("MAA03569");
  });

  it("garde l'accent et l'apostrophe hors du calcul", () => {
    const { matched } = matchCities(
      [{ key: "kelaat_m_gouna", name: "Kelâat M'Gouna" }],
      [{ code: "X", name: "KELAAT M'GOUNA" }]
    );
    expect(matched.get("kelaat_m_gouna")?.code).toBe("X");
  });

  it("ne rapproche toujours pas deux noms seulement voisins", () => {
    // "Kalaat" et "Kelaat" ne sont pas la meme chaine : un colis
    // envoye a l'a-peu-pres se perd a cent kilometres de la.
    const { matched, sansCorrespondance } = matchCities(
      [{ key: "kalaat_mgouna", name: "Kalaat MGouna" }],
      [{ code: "X", name: "KELAAT M'GOUNA", autresNoms: ["Kelaat MGouna"] }]
    );
    expect(matched.size).toBe(0);
    expect(sansCorrespondance).toEqual(["kalaat_mgouna"]);
  });
});

describe("uneSeuleEcriture", () => {
  it("ne garde qu'une ecriture par ville", () => {
    expect(uneSeuleEcriture(["SAFI", "Safi", "safi"])).toEqual(["SAFI"]);
  });

  it("garde la plus courte quand elles ne different que par la ponctuation", () => {
    expect(
      uneSeuleEcriture(["CASABLANCA (VILLE)", "CASABLANCA VILLE"])
    ).toEqual(["CASABLANCA VILLE"]);
  });

  it("ne confond pas une ville et son aeroport", () => {
    // La normalisation les separe : ce sont deux destinations.
    expect(uneSeuleEcriture(["CASABLANCA AEROPORT", "CASABLANCA"])).toEqual([
      "CASABLANCA",
      "CASABLANCA AEROPORT",
    ]);
  });

  it("laisse passer deux villes que la normalisation separe", () => {
    // Speedaf ecrit la meme commune de deux facons que rien ne
    // rapproche sans deviner : les deux partent chez lui, les deux
    // restent proposees.
    expect(uneSeuleEcriture(["EL KELAA MGOUNA", "KELAAT M'GOUNA"])).toEqual([
      "EL KELAA MGOUNA",
      "KELAAT M'GOUNA",
    ]);
  });

  it("ecarte ce qui ne se normalise en rien", () => {
    expect(uneSeuleEcriture(["", "  ", "---", "SAFI"])).toEqual(["SAFI"]);
  });

  it("classe les villes comme on les lit", () => {
    expect(uneSeuleEcriture(["TANGER", "AGADIR", "MEKNES"])).toEqual([
      "AGADIR",
      "MEKNES",
      "TANGER",
    ]);
  });
});
