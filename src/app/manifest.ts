import type { MetadataRoute } from "next";

/**
 * Manifeste d'installation.
 *
 * Il permet d'installer Orderly comme une application, depuis le
 * navigateur, sans passer par une boutique. `display: standalone` est ce
 * qui fait disparaitre la barre d'adresse une fois installee.
 *
 * `start_url` pointe sur la racine : une personne non connectee y sera
 * renvoyee vers /login, ce qui est le comportement attendu au lancement.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Orderly - Gestion des commandes",
    short_name: "Orderly",
    description:
      "Confirmation, expedition et suivi de vos commandes, de la boutique au client.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0B1120",
    theme_color: "#0B1120",
    lang: "fr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
