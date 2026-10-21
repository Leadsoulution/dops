import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { verifyWebhook } from "./client";

describe("verifyWebhook", () => {
  const cle = "secret-de-test";
  const corps = '{"eventId":"X","mailNo":"MA020000031836","tracks":[]}';
  const horodatage = "1718000000000";
  const bonne = createHmac("sha256", cle)
    .update(`${horodatage}\n${corps}`)
    .digest("hex");

  it("accepte une notification signee par Speedaf", () => {
    expect(verifyWebhook(cle, horodatage, corps, `hmac-sha256=${bonne}`)).toBe(true);
    // Le prefixe est facultatif, la casse indifferente.
    expect(verifyWebhook(cle, horodatage, corps, bonne.toUpperCase())).toBe(true);
  });

  it("refuse une signature fabriquee ailleurs", () => {
    expect(verifyWebhook("autre-cle", horodatage, corps, `hmac-sha256=${bonne}`)).toBe(false);
  });

  it("refuse un corps retouche apres signature", () => {
    const retouche = corps.replace("MA020000031836", "MA020000031837");
    expect(verifyWebhook(cle, horodatage, retouche, `hmac-sha256=${bonne}`)).toBe(false);
  });

  it("refuse un horodatage rejoue avec une autre valeur", () => {
    expect(verifyWebhook(cle, "1718000009999", corps, `hmac-sha256=${bonne}`)).toBe(false);
  });

  it("refuse une signature de longueur inattendue", () => {
    expect(verifyWebhook(cle, horodatage, corps, "hmac-sha256=abc")).toBe(false);
    expect(verifyWebhook(cle, horodatage, corps, "")).toBe(false);
  });
});

describe("deballage des reponses", () => {
  /*
   * Speedaf emballe tantot une fois, tantot deux : la liste des
   * regions revient en {success, data:{success, data:[...]}} alors que
   * la creation d'un colis revient en {success, data:{billCode}}.
   * Verifie sur leur environnement de test, et nulle part dans leur
   * documentation.
   */
  function enveloppe(interne: unknown) {
    return JSON.stringify({ success: true, error: null, data: interne });
  }

  it("rend la liste et non son enveloppe", async () => {
    const regions = [{ code: "MAR00024", name: "CASABLANCA - SETTAT" }];
    const faux = vi.fn(async () =>
      new Response(enveloppe({ success: true, error: null, data: regions }))
    );
    vi.stubGlobal("fetch", faux);
    const { getArea } = await import("./client");
    await expect(
      getArea(
        { baseUrl: "https://x", appCode: "a", customerCode: "c", platformSource: "p" },
        1
      )
    ).resolves.toEqual(regions);
    vi.unstubAllGlobals();
  });

  it("laisse intacte une reponse emballee une seule fois", async () => {
    const colis = { billCode: "MA020000031836", success: true, message: null };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(enveloppe(colis))));
    const { printLabels } = await import("./client");
    // `printLabels` lit `orderLabels` : une reponse sans ce champ rend
    // une liste vide plutot que de se tromper d'etage.
    await expect(
      printLabels(
        { baseUrl: "https://x", appCode: "a", customerCode: "c", platformSource: "p" },
        ["X"]
      )
    ).resolves.toEqual([]);
    vi.unstubAllGlobals();
  });
});
