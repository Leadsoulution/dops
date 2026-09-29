import { describe, expect, it } from "vitest";
import { adPlatformOf } from "./ad-platform";

describe("adPlatformOf", () => {
  it("reconnait les abreviations que WooCommerce enregistre", () => {
    // Ce sont les valeurs reelles des commandes de la boutique.
    expect(adPlatformOf("fb")?.key).toBe("facebook");
    expect(adPlatformOf("ig")?.key).toBe("instagram");
  });

  it("ignore la casse et les espaces", () => {
    expect(adPlatformOf("  FB  ")?.key).toBe("facebook");
    expect(adPlatformOf("TikTok")?.key).toBe("tiktok");
  });

  it("ramene les noms complets et les variantes a une seule plateforme", () => {
    for (const ecriture of ["fb", "facebook", "meta", "facebook.com"]) {
      expect(adPlatformOf(ecriture)?.key).toBe("facebook");
    }
  });

  it("reconnait un referent par son domaine", () => {
    expect(adPlatformOf("www.facebook.com")?.key).toBe("facebook");
    expect(adPlatformOf("l.instagram.com")?.key).toBe("instagram");
    expect(adPlatformOf("ads.tiktok.com")?.key).toBe("tiktok");
  });

  it("rend null sur une source inconnue, jamais 'direct'", () => {
    // Une case vide se remarque et se corrige ; un mauvais rangement
    // ne se voit jamais.
    expect(adPlatformOf("newsletter-mai")).toBeNull();
    expect(adPlatformOf("")).toBeNull();
    expect(adPlatformOf(null)).toBeNull();
  });

  it("porte un libelle lisible et la couleur de la marque", () => {
    expect(adPlatformOf("sc")?.label).toBe("Snapchat");
    expect(adPlatformOf("fb")?.color).toBe("#1877F2");
  });
});
