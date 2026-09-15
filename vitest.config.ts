import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `server-only` refuse d'etre importe hors d'un composant serveur.
      // Sous test il n'y a ni serveur ni client : on le neutralise, la
      // garde n'ayant de sens qu'au moment du rendu par Next.js.
      "server-only": path.resolve(__dirname, "./src/test/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
