import { describe, it, expect } from "vitest";
import { sanitizeWorkspace, WORKSPACE_DEFAULTS } from "./workspace-settings";
import {
  currencyOptions,
  languageOptions,
} from "@/components/dashboard/settings-data";

describe("sanitizeWorkspace", () => {
  it("garde ce qui a ete saisi", () => {
    const s = sanitizeWorkspace({
      shopName: "Ma boutique",
      email: "contact@exemple.ma",
      phone: "+212600000000",
      currency: currencyOptions[1],
      language: languageOptions[2],
      mediaStorage: "s3",
    });
    expect(s.shopName).toBe("Ma boutique");
    expect(s.currency).toBe(currencyOptions[1]);
    expect(s.language).toBe(languageOptions[2]);
    expect(s.mediaStorage).toBe("s3");
  });

  it("rend les valeurs par defaut quand rien n'est enregistre", () => {
    expect(sanitizeWorkspace({})).toEqual(WORKSPACE_DEFAULTS);
    expect(sanitizeWorkspace(null)).toEqual(WORKSPACE_DEFAULTS);
  });

  /*
   * La liste deroulante ne protege de rien : la requete peut arriver
   * sans passer par l'ecran. Une devise inconnue reviendrait dans un
   * champ sans option correspondante, impossible a corriger.
   */
  it("refuse une devise ou une langue hors liste", () => {
    const s = sanitizeWorkspace({ currency: "BTC", language: "Klingon" });
    expect(s.currency).toBe(WORKSPACE_DEFAULTS.currency);
    expect(s.language).toBe(WORKSPACE_DEFAULTS.language);
  });

  it("ne connait que deux stockages", () => {
    expect(sanitizeWorkspace({ mediaStorage: "ftp" }).mediaStorage).toBe("local");
  });

  it("coupe les espaces et borne la longueur", () => {
    const s = sanitizeWorkspace({
      shopName: "  Boutique  ",
      email: "a".repeat(500),
    });
    expect(s.shopName).toBe("Boutique");
    expect(s.email).toHaveLength(200);
  });

  it("ignore un champ qui n'est pas du texte", () => {
    expect(sanitizeWorkspace({ shopName: 42, phone: null })).toEqual(
      WORKSPACE_DEFAULTS
    );
  });
});
