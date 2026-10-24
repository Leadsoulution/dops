import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Lead } from "@/components/dashboard/leads-data";

const cancelOrder = vi.fn();
const getSpeedafSettings = vi.fn();

vi.mock("./client", async () => {
  const reel = await vi.importActual<typeof import("./client")>("./client");
  return { ...reel, cancelOrder: (...a: unknown[]) => cancelOrder(...a) };
});
vi.mock("@/lib/supabase/speedaf-settings", () => ({
  getSpeedafSettings: () => getSpeedafSettings(),
}));

const { cancelSpeedafParcel, colisARefaire } = await import("./amend");
const { SpeedafError } = await import("./client");

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    reference: "MO-1",
    productLabel: "",
    productName: "Montre",
    client: "Amine",
    phone: "0600000000",
    source: "Agent Manual",
    assignedTo: "",
    amount: "170 MAD",
    status: "Confirme",
    shipping: "En attente",
    date: "",
    ville: "Casablanca",
    carrier: "speedaf",
    trackingNumber: "MA0200005258",
    ...overrides,
  };
}

describe("colisARefaire", () => {
  it("refait le colis quand l'adresse change", () => {
    expect(
      colisARefaire(lead(), lead({ adresse: "Rue 2" }))
    ).toBe(true);
  });

  it("refait le colis quand le montant ou les produits changent", () => {
    expect(colisARefaire(lead(), lead({ amount: "200 MAD" }))).toBe(true);
    expect(
      colisARefaire(lead(), lead({ stockItems: "REF:2" }))
    ).toBe(true);
  });

  /*
   * Un changement d'agent ou de statut d'appel ne figure pas sur le
   * bordereau : refaire le colis ferait perdre un numero de suivi, que
   * le client a peut-etre deja, pour rien.
   */
  it("laisse le colis tranquille quand rien du bordereau ne change", () => {
    expect(
      colisARefaire(lead(), lead({ assignedTo: "Sara", status: "Confirme" }))
    ).toBe(false);
  });

  it("ne touche pas aux colis ForceLog", () => {
    const avant = lead({ carrier: "forcelog" });
    expect(colisARefaire(avant, lead({ carrier: "forcelog", ville: "Rabat" }))).toBe(
      false
    );
    // Transporteur absent : les commandes d'avant Speedaf, toutes chez
    // ForceLog.
    const ancien = lead({ carrier: undefined });
    expect(
      colisARefaire(ancien, lead({ carrier: undefined, ville: "Rabat" }))
    ).toBe(false);
  });

  it("ne refait rien tant qu'aucun colis n'est parti", () => {
    const avant = lead({ trackingNumber: undefined });
    expect(
      colisARefaire(avant, lead({ trackingNumber: undefined, ville: "Rabat" }))
    ).toBe(false);
  });
});

describe("cancelSpeedafParcel", () => {
  beforeEach(() => {
    cancelOrder.mockReset();
    getSpeedafSettings.mockReset();
    getSpeedafSettings.mockResolvedValue({
      appCode: "MA005200",
      customerCode: "MA005200",
      secretKey: "x",
      platformSource: "Loora",
    });
  });

  it("annule le colis chez Speedaf", async () => {
    cancelOrder.mockResolvedValue(undefined);
    await expect(cancelSpeedafParcel(lead(), "Corrigee")).resolves.toEqual({
      ok: true,
    });
    expect(cancelOrder).toHaveBeenCalledWith(
      expect.anything(),
      "MA0200005258",
      "Corrigee"
    );
  });

  /*
   * Le refus du transporteur est la vraie reponse : un agent qui lit
   * "colis deja ramasse" sait quoi faire, devant "erreur" il reessaie.
   */
  it("rend le motif de Speedaf quand il refuse", async () => {
    cancelOrder.mockRejectedValue(new SpeedafError("Colis deja ramasse"));
    await expect(cancelSpeedafParcel(lead(), "Corrigee")).resolves.toEqual({
      ok: false,
      raison: "Colis deja ramasse",
    });
  });

  it("n'appelle pas Speedaf pour un colis livre ou retourne", async () => {
    const livre = lead({ deliveryStatusCode: "DELIVERED" });
    const resultat = await cancelSpeedafParcel(livre, "Corrigee");
    expect(resultat.ok).toBe(false);
    expect(cancelOrder).not.toHaveBeenCalled();
  });

  it("n'appelle pas Speedaf pour un colis ForceLog", async () => {
    const resultat = await cancelSpeedafParcel(
      lead({ carrier: "forcelog" }),
      "Corrigee"
    );
    expect(resultat.ok).toBe(false);
    expect(cancelOrder).not.toHaveBeenCalled();
  });

  it("ne tente rien sans identifiants", async () => {
    getSpeedafSettings.mockResolvedValue(null);
    const resultat = await cancelSpeedafParcel(lead(), "Corrigee");
    expect(resultat).toEqual({
      ok: false,
      raison: "Identifiants Speedaf non configures.",
    });
    expect(cancelOrder).not.toHaveBeenCalled();
  });
});
