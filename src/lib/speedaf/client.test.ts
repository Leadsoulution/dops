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

describe("createStockOrder", () => {
  const config = {
    baseUrl: "https://x",
    appCode: "a",
    customerCode: "MA005200",
    platformSource: "Orderly",
    warehouseCode: "212",
  };

  function capture(reponse: unknown) {
    const appels: {
      url: string;
      corps: Record<string, unknown>;
      chaine: boolean;
    }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL, init: { body: string }) => {
        const brut = JSON.parse(init.body).data;
        appels.push({
          url: url.toString(),
          // La forme documentee envoie `data` en chaine echappee.
          corps: typeof brut === "string" ? JSON.parse(brut) : brut,
          chaine: typeof brut === "string",
        });
        return new Response(
          JSON.stringify({ success: true, error: null, data: reponse })
        );
      })
    );
    return appels;
  }

  const commande = {
    customOrderNo: "WC-2042",
    acceptName: "Client",
    acceptMobile: "0600000000",
    acceptAddress: "Rue 1",
    acceptProvinceName: "CASABLANCA - SETTAT",
    acceptCityName: "CASABLANCA",
    codFee: 299,
    items: [{ sku: "LOR-ROSE", quantity: 2 }],
  };

  it("appelle l'interface OMS, qui n'a pas de /v2/", async () => {
    const appels = capture({ billCode: "MA020000026718" });
    const { createStockOrder } = await import("./client");
    await createStockOrder(config, commande);
    expect(appels[0].url).toContain("/open-api/oms/express/order/createOrder");
    vi.unstubAllGlobals();
  });

  it("envoie l'entrepot, les references et le montant a encaisser", async () => {
    const appels = capture({ billCode: "MA020000026718" });
    const { createStockOrder } = await import("./client");
    const colis = await createStockOrder(config, commande);
    expect(colis.billCode).toBe("MA020000026718");
    expect(appels[0].corps).toMatchObject({
      warehouseCode: "212",
      codFee: 299,
      acceptCountryCode: "MA",
      productList: [{ sku: "LOR-ROSE", quantity: 2 }],
    });
    vi.unstubAllGlobals();
  });

  /*
   * Leur tableau des champs dit `customerCode`, tous leurs exemples
   * envoient `customCode`. Les deux partent : celui qui ne sert pas
   * est ignore, celui qui manquerait ferait refuser le colis.
   */
  it("envoie le code client sous les deux noms que leur doc emploie", async () => {
    const appels = capture({ billCode: "X" });
    const { createStockOrder } = await import("./client");
    await createStockOrder(config, commande);
    expect(appels[0].corps.customCode).toBe("MA005200");
    expect(appels[0].corps.customerCode).toBe("MA005200");
    vi.unstubAllGlobals();
  });

  it("n'envoie ni prix ni devise : l'entrepot a les siens", async () => {
    const appels = capture({ billCode: "X" });
    const { createStockOrder } = await import("./client");
    await createStockOrder(config, commande);
    const ligne = (appels[0].corps.productList as Record<string, unknown>[])[0];
    expect(ligne).not.toHaveProperty("goodsValue");
    expect(ligne).not.toHaveProperty("currencyType");
    vi.unstubAllGlobals();
  });

  it("transmet l'autorisation d'ouvrir le colis", async () => {
    const appels = capture({ billCode: "X" });
    const { createStockOrder } = await import("./client");
    await createStockOrder(config, { ...commande, allowOpen: true });
    expect(appels[0].corps.isAllowOpen).toBe(1);
    vi.unstubAllGlobals();
  });

  it("coupe la reference a seize caracteres, leur limite", async () => {
    const appels = capture({ billCode: "X" });
    const { createStockOrder } = await import("./client");
    await createStockOrder(config, {
      ...commande,
      customOrderNo: "REFERENCE-BEAUCOUP-TROP-LONGUE",
    });
    expect(appels[0].corps.customOrderNo).toBe("REFERENCE-BEAUCO");
    vi.unstubAllGlobals();
  });

  it("envoie data en chaine echappee, comme leur documentation", async () => {
    const appels = capture({ billCode: "X" });
    const { createStockOrder } = await import("./client");
    await createStockOrder(config, commande);
    expect(appels[0].chaine).toBe(true);
    vi.unstubAllGlobals();
  });

  /*
   * Leur doc annonce une chaine, l'express accepte l'objet, et
   * l'interface nous est fermee : impossible de trancher avant le
   * premier vrai appel. Un refus de format fait donc retenter sous
   * l'autre forme plutot que de perdre un colis.
   */
  it("retente en objet si le serveur refuse le format", async () => {
    const formes: boolean[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: URL, init: { body: string }) => {
        const brut = JSON.parse(init.body).data;
        formes.push(typeof brut === "string");
        return new Response(
          JSON.stringify(
            formes.length === 1
              ? { success: false, error: { code: "70001", message: "Invalid request data format" } }
              : { success: true, error: null, data: { billCode: "MA999" } }
          )
        );
      })
    );
    const { createStockOrder } = await import("./client");
    await expect(createStockOrder(config, commande)).resolves.toMatchObject({
      billCode: "MA999",
    });
    expect(formes).toEqual([true, false]);
    vi.unstubAllGlobals();
  });

  it("ne retente pas quand le refus vient du metier", async () => {
    let appels = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        appels++;
        return new Response(
          JSON.stringify({
            success: false,
            error: { code: "70801", message: "No permission" },
          })
        );
      })
    );
    const { createStockOrder } = await import("./client");
    await expect(createStockOrder(config, commande)).rejects.toThrow("No permission");
    expect(appels).toBe(1);
    vi.unstubAllGlobals();
  });

  it("refuse de partir sans entrepot : il n'y aurait rien a prelever", async () => {
    const { createStockOrder } = await import("./client");
    await expect(
      createStockOrder({ ...config, warehouseCode: undefined }, commande)
    ).rejects.toThrow(/entrepot/i);
  });

  it("signale un refus plutot que de rendre un colis sans numero", async () => {
    capture({ message: "SKU introuvable dans l'entrepot" });
    const { createStockOrder } = await import("./client");
    await expect(createStockOrder(config, commande)).rejects.toThrow(
      "SKU introuvable dans l'entrepot"
    );
    vi.unstubAllGlobals();
  });
});
