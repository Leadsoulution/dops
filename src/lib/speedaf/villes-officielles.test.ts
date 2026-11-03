import { describe, expect, it } from "vitest";
import { VILLES_OFFICIELLES, villesACompleter } from "./villes-officielles";
import { normalizeCity } from "@/lib/carriers/city-match";

describe("VILLES_OFFICIELLES", () => {
  it("tient la liste remise par Speedaf, sans doublon ni blanc", () => {
    expect(VILLES_OFFICIELLES.length).toBeGreaterThan(1700);
    expect(new Set(VILLES_OFFICIELLES).size).toBe(VILLES_OFFICIELLES.length);
    for (const nom of VILLES_OFFICIELLES) {
      expect(nom).toBe(nom.trim());
      expect(nom.length).toBeGreaterThan(1);
    }
  });

  it("couvre les villes que l'arbre des regions ignorait", () => {
    // Relevees le 3 novembre 2026 : absentes de getTreeByCountryCode,
    // presentes dans leur liste officielle.
    for (const nom of ["ABACHKOU", "AIN MEDIOUNA", "AGOUDIM"]) {
      expect(VILLES_OFFICIELLES).toContain(nom);
    }
  });
});

describe("villesACompleter", () => {
  const arbre = [
    { code: "MAR001", name: "CASABLANCA", parentName: "Casablanca - Settat" },
    {
      code: "MAR002",
      name: "KALAAT MGOUNA",
      parentName: "Draa - Tafilalet",
      autresNoms: ["Kelâat M'Gouna"],
    },
  ];

  it("laisse a l'arbre les villes qu'il connait, et leur region", () => {
    expect(villesACompleter(arbre, ["CASABLANCA", "TIKTAFAZOU"])).toEqual([
      { code: "TIKTAFAZOU", name: "TIKTAFAZOU" },
    ]);
  });

  it("reconnait une ville ecrite autrement dans l'arbre", () => {
    // Sans cela la commune reviendrait en double, et sa region serait
    // perdue au profit de la ligne sans parent.
    expect(villesACompleter(arbre, ["KELAAT M'GOUNA"])).toEqual([]);
  });

  it("n'ajoute qu'une fois deux ecritures de la meme commune", () => {
    // Deux lignes qui se normalisent pareil feraient echouer
    // l'enregistrement du lot entier sur la cle (carrier, code).
    const ajouts = villesACompleter(arbre, ["BNI OUKIL", "BNI-OUKIL"]);
    expect(ajouts).toHaveLength(1);
  });

  it("donne le nom comme code, puisque c'est ce que Speedaf attend", () => {
    const [ville] = villesACompleter(arbre, ["AIT HANI"]);
    expect(ville.code).toBe("AIT HANI");
    expect(ville.parentName).toBeUndefined();
  });

  it("rend des noms que notre dictionnaire sait normaliser", () => {
    for (const ville of villesACompleter(arbre)) {
      expect(normalizeCity(ville.name).length).toBeGreaterThan(0);
    }
  });
});
