import { describe, it, expect } from "vitest";
import { sign, verify, newSecret } from "./send";

const SECRET = "whsec_test";
const BODY = JSON.stringify({ event: "lead.created" });
const TS = "1758540000000";

describe("signature des webhooks", () => {
  it("accepte une signature juste", () => {
    expect(verify(SECRET, TS, BODY, sign(SECRET, TS, BODY))).toBe(true);
  });

  it("refuse un corps modifie", () => {
    const s = sign(SECRET, TS, BODY);
    expect(verify(SECRET, TS, '{"event":"autre"}', s)).toBe(false);
  });

  it("refuse un horodatage rejoue", () => {
    // Sans l'horodatage dans la signature, un appel capte pourrait etre
    // renvoye indefiniment, et le client recevrait deux fois le message.
    const s = sign(SECRET, TS, BODY);
    expect(verify(SECRET, "1758999999999", BODY, s)).toBe(false);
  });

  it("refuse un autre secret", () => {
    expect(verify("whsec_autre", TS, BODY, sign(SECRET, TS, BODY))).toBe(false);
  });

  it("refuse une signature de longueur differente sans lever", () => {
    expect(verify(SECRET, TS, BODY, "court")).toBe(false);
  });

  it("tire un secret different a chaque fois", () => {
    const a = newSecret(), b = newSecret();
    expect(a).not.toBe(b);
    expect(a.startsWith("whsec_")).toBe(true);
    expect(a.length).toBeGreaterThan(40);
  });
});
