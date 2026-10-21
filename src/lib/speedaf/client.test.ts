import { describe, expect, it } from "vitest";
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
