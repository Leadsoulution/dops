import { describe, expect, it } from "vitest";
import { enOrdre, latestStatus, NOUVEAU, speedafStatus } from "./status";

describe("speedafStatus", () => {
  it("traduit le trajet normal dans les codes de l'application", () => {
    expect(speedafStatus("1")?.code).toBe("TSUIVI");
    expect(speedafStatus("4")?.code).toBe("DISTRIBUTION");
    expect(speedafStatus("5")?.code).toBe("DELIVERED");
    expect(speedafStatus("730")?.code).toBe("RETURNED");
  });

  it("distingue les problemes que l'equipe traite differemment", () => {
    // "Pas de reponse" se rappelle, "faux numero" se ferme : les deux
    // ne doivent pas tomber dans le meme panier.
    expect(speedafStatus("IP01", "IP01-02")?.code).toBe("NO_ANSWER");
    expect(speedafStatus("IP01", "IP01-01")?.code).toBe("UNREACHABLE");
    expect(speedafStatus("IP05")?.code).toBe("REFUSE");
    expect(speedafStatus("IP04")?.code).toBe("OUT_OF_AREA");
  });

  it("fait passer le sous-code devant le code parent", () => {
    expect(speedafStatus("IP05", "IP05-09")?.code).toBe("CANCELED");
  });

  it("ne range pas un code inconnu au hasard", () => {
    expect(speedafStatus("9999")).toBeNull();
    expect(speedafStatus("")).toBeNull();
    expect(speedafStatus(null)).toBeNull();
  });
});

describe("latestStatus", () => {
  it("retient le dernier evenement connu", () => {
    expect(
      latestStatus([
        { action: "1", time: "2026-10-20 09:00" },
        { action: "4", time: "2026-10-21 08:00" },
        { action: "5", time: "2026-10-21 14:00" },
      ]).code
    ).toBe("DELIVERED");
  });

  it("remonte jusqu'au dernier evenement comprehensible", () => {
    expect(
      latestStatus([
        { action: "4", time: "2026-10-21 08:00" },
        { action: "9999", time: "2026-10-21 09:00" },
      ]).code
    ).toBe("DISTRIBUTION");
  });

  it("rend l'etat de depart quand il ne s'est rien passe", () => {
    expect(latestStatus([])).toEqual(NOUVEAU);
  });

  // C'est l'ordre que Speedaf emploie reellement. Lu a l'envers, un
  // colis retourne se lisait "ramasse par le transporteur".
  it("lit aussi une liste rendue du plus recent au plus ancien", () => {
    expect(
      latestStatus([
        { action: "730", time: "2026-10-30 16:22:40" },
        { action: "3", time: "2026-10-30 10:54:58" },
        { action: "4", time: "2026-10-29 16:53:40" },
        { action: "1", time: "2026-10-27 16:22:19" },
      ]).code
    ).toBe("RETURNED");
  });
});

describe("enOrdre", () => {
  it("retourne une liste descendante", () => {
    expect(
      enOrdre([
        { time: "2026-10-30 16:22:40" },
        { time: "2026-10-29 17:49:17" },
      ]).map((t) => t.time)
    ).toEqual(["2026-10-29 17:49:17", "2026-10-30 16:22:40"]);
  });

  it("laisse une liste montante telle quelle", () => {
    const liste = [{ time: "2026-10-29 17:49:17" }, { time: "2026-10-30 16:22:40" }];
    expect(enOrdre(liste)).toBe(liste);
  });

  it("ne touche a rien quand il n'y a pas de quoi comparer", () => {
    const seul = [{ action: "5", time: "2026-10-30 16:22:40" }];
    expect(enOrdre(seul)).toBe(seul);
  });
});
