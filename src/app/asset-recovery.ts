/**
 * Script de secours contre les fichiers de build manquants.
 *
 * A chaque deploiement, les fichiers de `/_next/static` changent de nom.
 * Un navigateur — ou un cache intermediaire — qui garde le HTML de la
 * version precedente reclame des fichiers qui n'existent plus : la page
 * s'affiche alors sans aucun style, ou ne demarre pas du tout.
 *
 * Ce script recharge la page une fois quand il voit un fichier de build
 * echouer. Le rechargement rapporte le HTML de la version en ligne, donc
 * les bons noms de fichiers, et l'incident se resout tout seul.
 *
 * Il est injecte tel quel dans le `<head>`, avant tout le reste : si le
 * script principal de l'application est justement celui qui manque, un
 * composant React ne serait jamais monte et ne pourrait rien rattraper.
 * C'est pour la meme raison qu'il est ecrit sans syntaxe moderne.
 */
export const ASSET_RECOVERY_SCRIPT = `(function () {
  var KEY = "orderly:asset-reload";

  function recover() {
    var last = 0;
    try { last = Number(sessionStorage.getItem(KEY) || 0); } catch (e) {}
    // Une seule tentative par minute. Si le serveur est reellement casse,
    // une page laide vaut mieux qu'une boucle de rechargements.
    if (Date.now() - last < 60000) return;
    try { sessionStorage.setItem(KEY, String(Date.now())); } catch (e) {}
    location.reload();
  }

  // Les erreurs de chargement d'un <link> ou d'un <script> ne remontent
  // pas : elles ne se voient qu'en phase de capture.
  window.addEventListener("error", function (event) {
    var el = event.target;
    if (!el || el === window) return;
    var url = el.href || el.src;
    if (typeof url === "string" && url.indexOf("/_next/static/") !== -1) {
      recover();
    }
  }, true);

  // Les morceaux charges a la demande, eux, echouent en promesse.
  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;
    if (!reason) return;
    var message = String(reason.message || reason);
    if (reason.name === "ChunkLoadError" || /Loading (CSS )?chunk/.test(message)) {
      recover();
    }
  });
})();`;
