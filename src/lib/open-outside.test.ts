import { afterEach, describe, expect, it, vi } from "vitest";
import { openOutside, openWhatsapp } from "./open-outside";

/** Une fenetre minimale : seuls `open` et `location` nous interessent. */
function fauxNavigateur(ouverte: boolean, auPremierPlan = true) {
  const assign = vi.fn();
  const open = vi.fn(() => (ouverte ? {} : null));
  // @ts-expect-error la fenetre de test ne porte que ce qu'on regarde.
  globalThis.window = { open, location: { assign }, setTimeout };
  // @ts-expect-error idem : seuls le focus et la visibilite comptent.
  globalThis.document = {
    visibilityState: auPremierPlan ? "visible" : "hidden",
    hasFocus: () => auPremierPlan,
  };
  return { assign, open };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("openOutside", () => {
  it("confie l'adresse au systeme plutot qu'a la fenetre de l'app", () => {
    const { assign, open } = fauxNavigateur(true);
    openOutside("https://wa.me/212600000000?text=bonjour");
    expect(open).toHaveBeenCalledWith(
      "https://wa.me/212600000000?text=bonjour",
      "_blank",
      "noopener,noreferrer"
    );
    // L'app ne doit pas bouger : c'est tout l'objet du correctif.
    expect(assign).not.toHaveBeenCalled();
  });

  it("navigue quand la nouvelle fenetre est refusee", () => {
    const { assign } = fauxNavigateur(false);
    openOutside("https://wa.me/212600000000");
    expect(assign).toHaveBeenCalledWith("https://wa.me/212600000000");
  });
});

describe("openWhatsapp", () => {
  const APP = "whatsapp://send?phone=212600000000&text=bonjour";
  const WEB = "https://wa.me/212600000000?text=bonjour";

  it("s'adresse d'abord au programme installe", () => {
    vi.useFakeTimers();
    const { assign, open } = fauxNavigateur(true);
    openWhatsapp(APP, WEB);
    expect(assign).toHaveBeenCalledWith(APP);
    // Rien vers le web tant que le delai n'est pas ecoule.
    expect(open).not.toHaveBeenCalled();
  });

  it("se rabat sur wa.me quand WhatsApp ne repond pas", () => {
    vi.useFakeTimers();
    const { open } = fauxNavigateur(true, true);
    openWhatsapp(APP, WEB);
    vi.advanceTimersByTime(2000);
    expect(open).toHaveBeenCalledWith(WEB, "_blank", "noopener,noreferrer");
  });

  it("ne double pas la conversation quand WhatsApp a pris la main", () => {
    vi.useFakeTimers();
    // La page est passee en arriere-plan : le programme a repondu.
    const { open } = fauxNavigateur(true, false);
    openWhatsapp(APP, WEB);
    vi.advanceTimersByTime(2000);
    expect(open).not.toHaveBeenCalled();
  });
});
