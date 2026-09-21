import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  encryptToken,
  decryptToken,
  tokenHint,
  canEncrypt,
} from "./crypto";

const CLE = "une-cle-de-test-assez-longue-pour-passer";
const JETON = "EAAG9ZClPqRsTuVwXyZ0123456789abcdefghijklmnop";

beforeEach(() => {
  process.env.ADS_TOKEN_KEY = CLE;
});
afterEach(() => {
  delete process.env.ADS_TOKEN_KEY;
});

describe("chiffrement des jetons", () => {
  it("rend le jeton d'origine apres un aller-retour", () => {
    expect(decryptToken(encryptToken(JETON))).toBe(JETON);
  });

  it("ne laisse pas le jeton lisible dans le texte chiffre", () => {
    const chiffre = encryptToken(JETON);
    expect(chiffre).not.toContain(JETON);
    expect(chiffre).not.toContain(JETON.slice(0, 12));
  });

  it("chiffre deux fois le meme jeton differemment", () => {
    // Le vecteur d'initialisation est tire au hasard : sans cela, deux
    // comptes portant le meme jeton se reconnaitraient a leur ligne.
    expect(encryptToken(JETON)).not.toBe(encryptToken(JETON));
  });

  it("refuse un texte chiffre modifie", () => {
    const parts = encryptToken(JETON).split(".");
    // On abime la charge utile en gardant la forme.
    const abime = [...parts];
    abime[3] = Buffer.from("autre chose").toString("base64");
    // GCM authentifie : la modification est detectee, pas subie.
    expect(decryptToken(abime.join("."))).toBeNull();
  });

  it("refuse un jeton chiffre avec une autre cle", () => {
    const chiffre = encryptToken(JETON);
    process.env.ADS_TOKEN_KEY = "une-autre-cle-tout-aussi-longue-ici";
    // Une cle perdue ne doit pas faire tomber la page : le compte est
    // simplement a reconnecter.
    expect(decryptToken(chiffre)).toBeNull();
  });

  it("rend null sur une valeur absente ou informe", () => {
    expect(decryptToken(null)).toBeNull();
    expect(decryptToken(undefined)).toBeNull();
    expect(decryptToken("")).toBeNull();
    expect(decryptToken("pas-du-tout-un-jeton")).toBeNull();
  });

  it("refuse de chiffrer sans cle configuree", () => {
    delete process.env.ADS_TOKEN_KEY;
    expect(canEncrypt()).toBe(false);
    // Mieux vaut echouer a l'ecriture qu'ecrire un jeton en clair.
    expect(() => encryptToken(JETON)).toThrow(/ADS_TOKEN_KEY/);
  });

  it("refuse une cle trop courte", () => {
    process.env.ADS_TOKEN_KEY = "trop-court";
    expect(canEncrypt()).toBe(false);
    expect(() => encryptToken(JETON)).toThrow();
  });
});

describe("tokenHint", () => {
  it("ne montre que la fin du jeton", () => {
    const indice = tokenHint(JETON);
    expect(indice).toBe("****mnop");
    expect(indice).not.toContain(JETON.slice(0, 8));
  });

  it("ne revele rien d'un jeton tres court", () => {
    expect(tokenHint("abc")).toBe("****");
  });
});
