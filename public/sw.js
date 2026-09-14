/**
 * Agent de service minimal.
 *
 * Il n'est pas la pour mettre en cache : les commandes changent trop vite
 * pour qu'une copie hors-ligne dise la verite, et rien ne serait pire
 * qu'un agent confirmant une commande sur des donnees d'hier.
 *
 * Il existe parce que les navigateurs exigent un agent de service muni
 * d'un gestionnaire `fetch` pour proposer l'installation. Celui-ci laisse
 * donc passer chaque requete telle quelle.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  /* Aucune interception : le reseau fait foi. */
});
