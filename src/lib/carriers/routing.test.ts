import { describe, expect, it } from "vitest";
import {
  actualShares,
  chooseCarrier,
  normalizeShares,
  type CarrierCounts,
} from "./routing";

const PARTAGE = { forcelog: 70, speedaf: 30 };

describe("normalizeShares", () => {
  it("ramene les parts a cent", () => {
    expect(normalizeShares({ a: 50, b: 30 })).toEqual({ a: 62.5, b: 37.5 });
  });

  it("ecarte les transporteurs a zero", () => {
    expect(normalizeShares({ a: 100, b: 0 })).toEqual({ a: 100 });
  });

  it("rend rien quand tout est a zero", () => {
    expect(normalizeShares({ a: 0, b: 0 })).toEqual({});
  });
});

describe("chooseCarrier", () => {
  it("ouvre sur le transporteur par defaut", () => {
    expect(chooseCarrier(PARTAGE, {}, "forcelog")).toBe("forcelog");
  });

  it("donne la commande au plus en retard sur sa part", () => {
    // ForceLog a tout pris : c'est au tour de Speedaf.
    expect(
      chooseCarrier(PARTAGE, { forcelog: 7, speedaf: 0 }, "forcelog")
    ).toBe("speedaf");
    // Speedaf a depasse sa part : retour a ForceLog.
    expect(
      chooseCarrier(PARTAGE, { forcelog: 6, speedaf: 4 }, "forcelog")
    ).toBe("forcelog");
  });

  it("tient la repartition voulue sur une serie", () => {
    // Dix commandes a 70/30 doivent donner sept et trois.
    const counts: CarrierCounts = { forcelog: 0, speedaf: 0 };
    for (let i = 0; i < 10; i += 1) {
      const choisi = chooseCarrier(PARTAGE, counts, "forcelog");
      counts[choisi] += 1;
    }
    expect(counts).toEqual({ forcelog: 7, speedaf: 3 });
  });

  it("tient aussi une repartition egale", () => {
    const counts: CarrierCounts = { forcelog: 0, speedaf: 0 };
    for (let i = 0; i < 8; i += 1) {
      counts[chooseCarrier({ forcelog: 50, speedaf: 50 }, counts, "forcelog")] += 1;
    }
    expect(counts).toEqual({ forcelog: 4, speedaf: 4 });
  });

  it("envoie tout chez celui qui a cent pour cent", () => {
    const counts: CarrierCounts = { forcelog: 0, speedaf: 0 };
    for (let i = 0; i < 5; i += 1) {
      counts[chooseCarrier({ forcelog: 100, speedaf: 0 }, counts, "forcelog")] += 1;
    }
    expect(counts).toEqual({ forcelog: 5, speedaf: 0 });
  });

  it("rattrape un desequilibre existant", () => {
    // Vingt commandes parties chez ForceLog, rien chez Speedaf : les
    // suivantes vont chez Speedaf jusqu'a revenir a 70/30.
    const counts: CarrierCounts = { forcelog: 20, speedaf: 0 };
    for (let i = 0; i < 6; i += 1) {
      counts[chooseCarrier(PARTAGE, counts, "forcelog")] += 1;
    }
    expect(counts.speedaf).toBe(6);
  });

  it("ne bloque pas une commande quand aucune part n'est definie", () => {
    expect(chooseCarrier({}, { forcelog: 3 }, "forcelog")).toBe("forcelog");
    expect(chooseCarrier({ forcelog: 0, speedaf: 0 }, {}, "speedaf")).toBe(
      "speedaf"
    );
  });

  it("ouvre sur le mieux doté quand le defaut n'a aucune part", () => {
    expect(chooseCarrier({ speedaf: 100 }, {}, "forcelog")).toBe("speedaf");
  });
});

describe("actualShares", () => {
  it("rend la repartition obtenue", () => {
    expect(actualShares({ forcelog: 7, speedaf: 3 })).toEqual({
      forcelog: 70,
      speedaf: 30,
    });
  });

  it("ne divise pas par zero", () => {
    expect(actualShares({ forcelog: 0, speedaf: 0 })).toEqual({});
  });
});
