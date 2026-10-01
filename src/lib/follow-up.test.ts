import { describe, expect, it } from "vitest";
import {
  daysSince,
  isLate,
  needsConfirmationFollowUp,
  needsDeliveryFollowUp,
} from "./follow-up";

describe("needsConfirmationFollowUp", () => {
  it("retient les dossiers qui attendent un rappel", () => {
    for (const s of [
      "Pas de rep 4",
      "Injoignable 2",
      "Whatsapp",
      "En attente",
      "Rappel",
      "Reportee",
      "+3 jours",
    ]) {
      expect(needsConfirmationFollowUp(s), s).toBe(true);
    }
  });

  it("ecarte les dossiers clos", () => {
    for (const s of [
      "Confirme",
      "EXPIDER",
      "Annulee",
      "Faux numero",
      "Non commandee",
      "En double",
    ]) {
      expect(needsConfirmationFollowUp(s), s).toBe(false);
    }
  });

  it("ecarte une commande jamais appelee", () => {
    // C'est le travail courant, pas une relance : elle a son onglet, et
    // la melanger ici noierait les dossiers qui trainent.
    expect(needsConfirmationFollowUp("Nouveau")).toBe(false);
  });
});

describe("needsDeliveryFollowUp", () => {
  it("retient les colis qu'un appel peut encore sauver", () => {
    for (const c of [
      "NO_ANSWER",
      "NO_ANSWER_TEAM",
      "POSTPONED",
      "CANCELED",
      "UNREACHABLE",
      "RERETURN",
    ]) {
      expect(needsDeliveryFollowUp(c), c).toBe(true);
    }
  });

  it("ecarte les colis dont le sort est joue", () => {
    // Un retour est rentre, un refus a eu lieu a la porte : relancer
    // ferait perdre du temps sur un dossier mort.
    for (const c of ["DELIVERED", "RETURNED", "REFUSE", "OUT_OF_AREA"]) {
      expect(needsDeliveryFollowUp(c), c).toBe(false);
    }
  });

  it("ecarte un colis qui roule normalement", () => {
    expect(needsDeliveryFollowUp("DISTRIBUTION")).toBe(false);
    expect(needsDeliveryFollowUp(null)).toBe(false);
  });
});

describe("daysSince", () => {
  const maintenant = new Date("2026-10-01T12:00:00+01:00");

  it("compte les jours entiers ecoules", () => {
    expect(daysSince("2026-09-28T12:00:00+01:00", maintenant)).toBe(3);
  });

  it("lit une date sans fuseau a l'heure du Maroc", () => {
    // Sans cela le compteur sautait d'un jour entre le serveur, en UTC,
    // et la machine de developpement.
    expect(daysSince("2026-09-28 12:00:00", maintenant)).toBe(3);
  });

  it("ne rend jamais de nombre negatif", () => {
    expect(daysSince("2026-10-05T12:00:00+01:00", maintenant)).toBe(0);
    expect(daysSince(null, maintenant)).toBe(0);
  });
});

describe("isLate", () => {
  it("laisse deux jours a la confirmation, trois a la livraison", () => {
    expect(isLate("confirmation", 1)).toBe(false);
    expect(isLate("confirmation", 2)).toBe(true);
    expect(isLate("livraison", 2)).toBe(false);
    expect(isLate("livraison", 3)).toBe(true);
  });
});
