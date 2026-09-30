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

  it("marque une commande passee ecartee a la confirmation", () => {
    // Le cas qui manquait : un client deja rappele en vain, dont la
    // commande a fini annulee, passait pour un inconnu.
    for (const statut of [
      "Annulee",
      "Non commandee",
      "Faux numero",
      "En double",
      "Expiree",
    ]) {
      const flags = clientFlags([
        lead("1", "0612345678", "Nouveau"),
        lead("2", "0612345678", statut),
      ]);
      expect(flags.get("1"), statut).toBe("rejected");
    }
  });

  it("marque une commande confirmee encore en route", () => {
    const flags = clientFlags([
      lead("1", "0612345678", "Nouveau"),
      lead("2", "0612345678", "Confirme", "DISTRIBUTION"),
    ]);
    expect(flags.get("1")).toBe("inTransit");
  });

  it("ne laisse jamais un client deja venu sans pastille", () => {
    // Quel que soit le statut de l'autre commande, quelque chose
    // s'affiche : c'est tout l'objet de la regle.
    const statuts = [
      "Nouveau", "Rappel", "Injoignable 3", "Pas de rep 2", "En attente",
      "Whatsapp", "Reportee", "+3 jours", "Confirme", "EXPIDER",
      "Annulee", "Non commandee", "Faux numero", "En double", "Expiree",
    ];
    for (const statut of statuts) {
      const flags = clientFlags([
        lead("1", "0612345678", "Nouveau"),
        lead("2", "0612345678", statut),
      ]);
      expect(flags.get("1"), statut).toBeDefined();
    }
  });

  it("fait passer le retour devant la livraison", () => {
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
    expect(flags.get("1")).toBe("inTransit");
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

  it("distingue une annulation d'une commande qui attend un appel", () => {
    const flags = clientFlags([
      lead("1", "0612345678", "Nouveau"),
      lead("2", "0612345678", "Annulee"),
    ]);
    expect(flags.get("1")).toBe("rejected");
  });

  it("fait passer le colis revenu devant le colis remis", () => {
    const flags = clientFlags([
      lead("1", "0612345678", "Nouveau"),
      lead("2", "0612345678", "Confirme", "DELIVERED"),
      lead("3", "0612345678", "Annulee"),
      lead("4", "0612345678", "Confirme", "RETURNED"),
    ]);
    expect(flags.get("1")).toBe("failed");
  });

  it("fait passer le colis remis devant une annulation", () => {
    // Un client qui a deja recu un colis vaut mieux qu'un client qui a
    // deja renonce une fois.
    const flags = clientFlags([
      lead("1", "0612345678", "Nouveau"),
      lead("2", "0612345678", "Confirme", "DELIVERED"),
      lead("3", "0612345678", "Annulee"),
    ]);
    expect(flags.get("1")).toBe("delivered");
  });
});
