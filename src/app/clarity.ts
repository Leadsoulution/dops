/**
 * Microsoft Clarity : l'enregistrement des sessions.
 *
 * Il rejoue le parcours d'un agent — ses clics, ses allers-retours,
 * ses hesitations — la ou le journal des commandes ne dit que ce qui
 * a change. Les deux repondent a des questions differentes : "qui a
 * annule cette commande" se lit dans `lead_events`, "pourquoi la
 * confirmation prend trois minutes" se regarde ici.
 *
 * Clarity ne filme pas l'ecran : il envoie le contenu des pages chez
 * Microsoft pour le reconstituer. Orderly affiche en permanence des
 * noms, des telephones et des adresses de clients, donc le masquage
 * doit rester sur **Strict** dans les reglages Clarity — c'est la
 * seule position ou le texte des pages ne sort pas d'ici. Le mode par
 * defaut, "Equilibre", ne masque que les nombres et les e-mails et
 * laisserait partir le reste en clair.
 *
 * Le code est celui que Clarity fournit, recopie tel quel : leur page
 * d'installation verifie sa presence pour valider le projet, et le
 * reecrire plus proprement ferait echouer cette verification.
 *
 * Injecte dans le `<head>` comme [[ASSET_RECOVERY_SCRIPT]], pour la
 * meme raison d'ordre : la mesure doit demarrer avant la page, sinon
 * les premieres secondes de chaque visite manquent a l'enregistrement.
 */
export const CLARITY_PROJECT_ID = "zazw29vppk";

export const CLARITY_SCRIPT = `(function(c,l,a,r,i,t,y){
  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");`;
