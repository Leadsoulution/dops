import { describe, expect, it } from "vitest";
import {
  daysSince,
  followUpState,
  isLate,
  markLabel,
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

  it("laisse tomber au-dela de trois jours de silence", () => {
    // Passe ce delai le client s'est decide ailleurs ; garder le
    // dossier ferait disparaitre les appels du jour sous les perdus.
    expect(needsConfirmationFollowUp("Injoignable 2", 3)).toBe(true);
    expect(needsConfirmationFollowUp("Injoignable 2", 4)).toBe(false);
    expect(needsConfirmationFollowUp("+3 jours", 14)).toBe(false);
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
    // Un retour est rentre, le colis est hors zone : relancer ferait
    // perdre du temps sur un dossier mort.
    for (const c of ["DELIVERED", "RETURNED", "OUT_OF_AREA"]) {
      expect(needsDeliveryFollowUp(c), c).toBe(false);
    }
  });

  it("ne garde un refus ou une annulation que trois jours", () => {
    // Le client a dit non une fois : on retente, mais pas indefiniment.
    for (const c of ["CANCELED", "CANCELED_TEAM", "REFUSE"]) {
      expect(needsDeliveryFollowUp(c, 3), c).toBe(true);
      expect(needsDeliveryFollowUp(c, 4), c).toBe(false);
    }
  });

  it("garde sans limite un colis qui n'a pas repondu", () => {
    // Rien n'a ete refuse : le client n'a simplement pas encore repondu.
    expect(needsDeliveryFollowUp("NO_ANSWER", 30)).toBe(true);
    expect(needsDeliveryFollowUp("POSTPONED", 30)).toBe(true);
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

describe("followUpState", () => {
  const maintenant = new Date("2026-10-01T12:00:00+01:00");

  it("rend du tout de suite un dossier jamais marque", () => {
    expect(followUpState(0, null, maintenant)).toBe("due");
  });

  it("met de cote pendant vingt-quatre heures", () => {
    expect(followUpState(1, "2026-10-01T09:00:00+01:00", maintenant)).toBe(
      "resting"
    );
  });

  it("le rend a sa file le lendemain", () => {
    expect(followUpState(1, "2026-09-30T09:00:00+01:00", maintenant)).toBe(
      "due"
    );
  });

  it("sort du suivi au troisieme marquage", () => {
    // Meme marque a l'instant : trois fois suffit.
    expect(followUpState(3, "2026-10-01T11:59:00+01:00", maintenant)).toBe(
      "done"
    );
  });

  it("lit une date sans fuseau a l'heure du Maroc", () => {
    expect(followUpState(1, "2026-10-01 09:00:00", maintenant)).toBe("resting");
  });
});

describe("markLabel", () => {
  it("numerote le prochain marquage", () => {
    expect(markLabel(0)).toBe("Marquer traite 1");
    expect(markLabel(1)).toBe("Marquer traite 2");
    expect(markLabel(2)).toBe("Marquer traite 3");
  });

  it("ne depasse jamais trois", () => {
    expect(markLabel(3)).toBe("Marquer traite 3");
  });
});
