import { describe, expect, it } from "vitest";
import { latestStatus, NOUVEAU, speedafStatus } from "./status";

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
});
