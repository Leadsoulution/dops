/**
 * Agent de service.
 *
 * Deux roles, et un seul qui compte vraiment :
 *
 * 1. Recevoir les notifications push. C'est lui qui les affiche quand
 *    l'application est fermee : sans agent, un telephone ne peut pas
 *    etre joint.
 *
 * 2. Rendre l'installation possible. Les navigateurs exigent un
 *    gestionnaire `fetch` pour la proposer. Il ne met rien en cache :
 *    les commandes changent trop vite pour qu'une copie hors-ligne dise
 *    la verite, et rien ne serait pire qu'un agent confirmant sur des
 *    donnees d'hier.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  /* Aucune interception : le reseau fait foi. */
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Orderly", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Orderly";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // Un tag par evenement : deux alertes sur la meme commande se
      // remplacent au lieu de s'empiler.
      tag: payload.tag,
      // Une livraison vibre plus longuement qu'une arrivee de commande :
      // c'est le seul moyen de les distinguer sans regarder l'ecran, le
      // web ne permettant pas de choisir le son du systeme.
      vibrate:
        payload.kind === "payment" ? [120, 60, 120, 60, 240] : [80, 40, 80],
      data: { url: payload.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  // Reutilise une fenetre deja ouverte plutot que d'en empiler une
  // nouvelle a chaque notification.
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});
