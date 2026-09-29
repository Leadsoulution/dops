import { describe, expect, it } from "vitest";
import { clientFlags, normalizePhone, type HistoryLead } from "./client-history";

const lead = (
  id: string,
  phone: string,
  status: string,
  deliveryStatusCode?: string
): HistoryLead => ({ id, phone, status, deliveryStatusCode });

describe("normalizePhone", () => {
  it("ramene toutes les ecritures d'un numero a une seule", () => {
    const attendu = "0612345678";
    expect(normalizePhone("0612345678")).toBe(attendu);
    expect(normalizePhone("+212 612 345 678")).toBe(attendu);
    expect(normalizePhone("212612345678")).toBe(attendu);
    expect(normalizePhone("612345678")).toBe(attendu);
    expect(normalizePhone("06-12-34-56-78")).toBe(attendu);
  });

  it("rend une chaine vide quand il n'y a pas de numero", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone(null)).toBe("");
    expect(normalizePhone("sans chiffre")).toBe("");
  });
});

describe("clientFlags", () => {
  it("ne marque pas une premiere commande", () => {
    const flags = clientFlags([lead("1", "0612345678", "Nouveau")]);
    expect(flags.get("1")).toBeUndefined();
  });

  it("marque en rouge le client dont un colis est revenu", () => {
    const flags = clientFlags([
      lead("1", "0612345678", "Nouveau"),
      lead("2", "0612345678", "Confirme", "RETURNED"),
    ]);
    expect(flags.get("1")).toBe("failed");
  });

  it("marque en vert le client qui a deja recu un colis", () => {
    const flags = clientFlags([
      lead("1", "0612345678", "Nouveau"),
      lead("2", "0612345678", "Confirme", "DELIVERED"),
    ]);
    expect(flags.get("1")).toBe("delivered");
  });

  it("marque en jaune une autre commande encore en attente", () => {
    const flags = clientFlags([
      lead("1", "0612345678", "Nouveau"),
      lead("2", "0612345678", "Rappel"),
    ]);
    expect(flags.get("1")).toBe("pending");
  });

  it("fait passer l'avertissement devant la bonne nouvelle", () => {
    const flags = clientFlags([
      lead("1", "0612345678", "Nouveau"),
      lead("2", "0612345678", "Confirme", "DELIVERED"),
      lead("3", "0612345678", "Confirme", "RETURNED"),
    ]);
    expect(flags.get("1")).toBe("failed");
  });

  it("ne tient pas un colis en route pour un echec", () => {
    // Il peut encore arriver : l'accuser d'avance marquerait un bon
    // client en rouge.
    const flags = clientFlags([
      lead("1", "0612345678", "Confirme", "DELIVERED"),
      lead("2", "0612345678", "Confirme", "DISTRIBUTION"),
    ]);
    expect(flags.get("1")).toBeUndefined();
    expect(flags.get("2")).toBe("delivered");
  });

  it("juge chaque commande sur les autres, jamais sur elle-meme", () => {
    // Celle qui est revenue ne doit pas se marquer elle-meme en rouge :
    // c'est l'autre commande du client qui la renseigne.
    const flags = clientFlags([
      lead("1", "0612345678", "Confirme", "RETURNED"),
      lead("2", "0612345678", "Confirme", "DELIVERED"),
    ]);
    expect(flags.get("1")).toBe("delivered");
    expect(flags.get("2")).toBe("failed");
  });

  it("reconnait le meme client sous deux ecritures de numero", () => {
    const flags = clientFlags([
      lead("1", "0612345678", "Nouveau"),
      lead("2", "+212612345678", "Confirme", "DELIVERED"),
    ]);
    expect(flags.get("1")).toBe("delivered");
  });

  it("ne confond pas les commandes sans numero", () => {
    const flags = clientFlags([
      lead("1", "", "Nouveau"),
      lead("2", "", "Confirme", "RETURNED"),
    ]);
    expect(flags.size).toBe(0);
  });

  it("ne voit pas une confirmation tranchee comme une attente", () => {
    // Annulee est une decision, pas une commande qui attend un appel.
    const flags = clientFlags([
      lead("1", "0612345678", "Nouveau"),
      lead("2", "0612345678", "Annulee"),
    ]);
    expect(flags.get("1")).toBeUndefined();
  });
});
