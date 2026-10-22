import { describe, expect, it } from "vitest";
import { delivererFrom } from "./sync";

/**
 * Speedaf n'expose pas le livreur comme un champ : il est ecrit dans
 * la phrase, entre crochets. L'extraction est fragile par nature, donc
 * verrouillee par des exemples tires de leur documentation.
 */
describe("delivererFrom", () => {
  it("lit le livreur de la mise en distribution", () => {
    expect(
      delivererFrom([
        { action: "1", msgEng: "Received in 【MA speedaf1】, Pick-Up Courier is 【WEISS1】" },
        { action: "4", msgEng: "【WEISS2】in 【MA speedaf2】scanned for delivery; The delivery courier is 【WEISS2】." },
      ])
    ).toEqual({ name: "WEISS2" });
  });

  it("prefere le dernier evenement de livraison", () => {
    expect(
      delivererFrom([
        { action: "4", msgEng: "The delivery courier is 【WEISS2】." },
        { action: "5", msgEng: "Parcel delivered 【Collected】and Received by 【WEISS3】" },
      ])
    ).toEqual({ name: "WEISS3" });
  });

  it("ignore le trajet, qui ne nomme pas de livreur", () => {
    expect(
      delivererFrom([
        { action: "2", msgEng: "Loaded at 【MA speedaf1】; Departed for 【DC-CASA】" },
        { action: "3", msgEng: "Arrived at 【DC-CASA】" },
      ])
    ).toBeUndefined();
  });

  it("separe le nom du numero quand les deux sont donnes", () => {
    // "Pick-Up Courier is 【Ejalonibu Wahab】【09025119825】" : le nom
    // precede le telephone, et l'equipe a besoin des deux.
    expect(
      delivererFrom([
        { action: "4", msgEng: "courier is 【Ejalonibu Wahab】【09025119825】" },
      ])
    ).toEqual({ name: "Ejalonibu Wahab", phone: "09025119825" });
  });

  it("lit le livreur dans un message reel, en francais", () => {
    // Releve sur un colis de production : le message nomme le hub,
    // l'operateur, puis le livreur et son numero. C'est le dernier nom
    // qui porte le colis.
    expect(
      delivererFrom([
        {
          action: "4",
          message:
            "【Hub Ouazazate 4】 a scanne pour livraison, l'operateur est 【Rachid】, le livreur est 【ABDESSAMAD MELLOUKI】【0676919588】",
        },
      ])
    ).toEqual({ name: "ABDESSAMAD MELLOUKI", phone: "0676919588" });
  });

  it("ne rend rien sans message exploitable", () => {
    expect(delivererFrom([])).toBeUndefined();
    expect(delivererFrom([{ action: "5" }])).toBeUndefined();
  });
});
