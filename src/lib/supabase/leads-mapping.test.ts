import { describe, it, expect } from "vitest";
import { toRow } from "./leads";

/**
 * La distinction entre "ne touche pas" et "efface" a la traduction vers
 * la base. Une commande partie apres un refus gardait a l'ecran le
 * message expliquant pourquoi elle n'etait pas partie.
 */
describe("toRow", () => {
  it("laisse intact un champ absent", () => {
    expect(toRow({ client: "Hind" })).not.toHaveProperty("tracking_error");
  });

  it("efface l'erreur quand elle vaut null", () => {
    expect(toRow({ trackingError: null })).toEqual({ tracking_error: null });
  });

  it("enregistre une nouvelle erreur", () => {
    expect(toRow({ trackingError: "Ville inconnue" })).toEqual({
      tracking_error: "Ville inconnue",
    });
  });

  it("efface l'erreur en meme temps qu'il pose le colis", () => {
    // Ce que renvoie un envoi reussi : les deux champs partent ensemble.
    expect(
      toRow({ trackingNumber: "F-CSA123", trackingError: null })
    ).toEqual({ tracking_number: "F-CSA123", tracking_error: null });
  });
});
