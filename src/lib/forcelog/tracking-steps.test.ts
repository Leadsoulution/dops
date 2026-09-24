import { describe, it, expect } from "vitest";
import { viewForStatus, stepDates, trackingUrl, STEPS } from "./tracking-steps";

describe("viewForStatus", () => {
  it("place chaque etape au bon rang", () => {
    expect(viewForStatus("NEW_PARCEL").currentIndex).toBe(0);
    expect(viewForStatus("PICKED_UP").currentIndex).toBe(1);
    expect(viewForStatus("SENT").currentIndex).toBe(2);
    expect(viewForStatus("DISTRIBUTION").currentIndex).toBe(3);
    expect(viewForStatus("DELIVERED").currentIndex).toBe(4);
  });

  it("garde un colis reporte en cours de livraison", () => {
    // Report, absence, injoignable : le colis est toujours dehors, et
    // reculer la ligne donnerait au client l'impression d'un retour en
    // arriere qui n'a pas eu lieu.
    for (const c of ["POSTPONED", "NO_ANSWER", "UNREACHABLE", "RELAUNCH"])
      expect(viewForStatus(c).currentIndex).toBe(3);
  });

  it("sort du chemin les colis qui ne seront pas livres", () => {
    for (const [code, mot] of [["RETURNED", "Retourne"], ["REFUSE", "Refuse"], ["CANCELED", "Annule"]]) {
      const v = viewForStatus(code);
      expect(v.currentIndex).toBe(-1);
      expect(v.stopped).toContain(mot);
      expect(v.done).toBe(false);
    }
  });

  it("ne tombe pas sur un code inconnu", () => {
    // Le transporteur ajoute des codes sans prevenir : un client ne doit
    // pas voir une page vide pour autant.
    const v = viewForStatus("CODE_QUI_NEXISTE_PAS_ENCORE");
    expect(v.currentIndex).toBeGreaterThanOrEqual(0);
    expect(v.stopped).toBeUndefined();
  });

  it("marque le parcours acheve a la livraison", () => {
    expect(viewForStatus("DELIVERED").done).toBe(true);
    expect(viewForStatus("DISTRIBUTION").done).toBe(false);
  });
});

describe("stepDates", () => {
  it("retient la premiere fois qu'une etape est atteinte", () => {
    const d = stepDates([
      { STATUS_CODE: "NEW_PARCEL", TIME: "2026-09-22 14:55" },
      { STATUS_CODE: "DISTRIBUTION", TIME: "2026-09-23 09:31" },
      { STATUS_CODE: "POSTPONED", TIME: "2026-09-23 18:00" },
      // Retour en livraison le lendemain : la date d'origine doit rester.
      { STATUS_CODE: "DISTRIBUTION", TIME: "2026-09-24 10:00" },
    ]);
    expect(d.created).toBe("2026-09-22 14:55");
    expect(d.delivering).toBe("2026-09-23 09:31");
  });

  it("ignore un historique vide sans se plaindre", () => {
    expect(stepDates([])).toEqual({});
  });
});

describe("trackingUrl", () => {
  it("compose l'adresse envoyee au client", () => {
    expect(trackingUrl("F-ALR26MY1QM91", "https://orderly.host")).toBe(
      "https://orderly.host/suivi-F-ALR26MY1QM91"
    );
  });

  it("ne double pas la barre oblique", () => {
    expect(trackingUrl("F-1", "https://orderly.host/")).toBe(
      "https://orderly.host/suivi-F-1"
    );
  });
});

describe("STEPS", () => {
  it("decrit les cinq etapes attendues", () => {
    expect(STEPS.map((s) => s.label)).toEqual([
      "Colis cree", "Collecte", "En cours de traitement",
      "En cours de livraison", "Livre",
    ]);
  });
});
