import { describe, expect, it, vi } from "vitest";
import { openOutside } from "./open-outside";

/** Une fenetre minimale : seuls `open` et `location` nous interessent. */
function fauxNavigateur(ouverte: boolean) {
  const assign = vi.fn();
  const open = vi.fn(() => (ouverte ? {} : null));
  // @ts-expect-error la fenetre de test ne porte que ce qu'on regarde.
  globalThis.window = { open, location: { assign } };
  return { assign, open };
}

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
