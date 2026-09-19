import { describe, it, expect } from "vitest";
import { shouldDispatch } from "./dispatch";

describe("shouldDispatch", () => {
  it("envoie une commande confirmee sans colis", () => {
    expect(shouldDispatch({ status: "Confirme" })).toBe(true);
  });

  /*
   * Le cas signale. Premier essai : la ville est refusee, la commande
   * reste confirmee sans colis. L'agent corrige la ville — le statut ne
   * bouge pas. L'envoi doit repartir quand meme, sans avoir a passer par
   * un autre statut puis revenir.
   */
  it("reessaie apres correction, sans changement de statut", () => {
    const apresCorrection = {
      status: "Confirme",
      trackingNumber: undefined,
      trackingError: 'Ville inconnue "Casablnca" : saisir la ville exacte',
    };
    expect(shouldDispatch(apresCorrection)).toBe(true);
  });

  it("ne renvoie pas une commande qui a deja son colis", () => {
    expect(
      shouldDispatch({ status: "Confirme", trackingNumber: "F-CSA123" })
    ).toBe(false);
  });

  it("n'envoie pas une commande qui n'est pas confirmee", () => {
    for (const status of ["Nouveau", "Pas de rep 1", "En attente", "Annulee"]) {
      expect(shouldDispatch({ status })).toBe(false);
    }
  });

  it("n'envoie pas une commande annulee apres avoir ete confirmee", () => {
    // Confirmee puis annulee sans jamais partir : elle doit le rester.
    expect(shouldDispatch({ status: "Annulee", trackingNumber: undefined })).toBe(
      false
    );
  });
});
