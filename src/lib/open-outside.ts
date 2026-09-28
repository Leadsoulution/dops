/**
 * Ouvre une adresse en dehors de l'application.
 *
 * Installee sur l'ecran d'accueil, Orderly tourne dans sa propre fenetre,
 * sans barre d'adresse ni bouton retour. Une navigation directe y
 * remplacait l'app par la page de WhatsApp : l'agent se retrouvait
 * enferme dans un site etranger et devait relancer Orderly pour revenir
 * a sa fiche.
 *
 * `_blank` rend la main au systeme. Une adresse qui sort du perimetre de
 * l'app — wa.me, le site du transporteur — part alors dans le vrai
 * navigateur, avec ses onglets et ses polices completes. Une adresse
 * d'Orderly, elle, restera dans l'app : aucune interface web ne permet de
 * la pousser vers le navigateur, et le bouton Copier existe pour ca.
 *
 * Si la fenetre est refusee, on navigue quand meme : un bouton qui ne
 * fait rien est pire qu'un bouton qui derange.
 */
export function openOutside(url: string): void {
  const fenetre = window.open(url, "_blank", "noopener,noreferrer");
  if (!fenetre) window.location.assign(url);
}

/**
 * Deux secondes : assez pour que le systeme bascule sur WhatsApp, assez
 * court pour que l'agent ne croie pas le bouton mort.
 */
const DELAI_DE_REPLI = 2000;

/**
 * Ouvre une conversation dans WhatsApp, le programme, pas la page.
 *
 * `whatsapp://` ne navigue pas : le systeme detourne l'adresse vers
 * l'application et la page reste ou elle etait. Rien ne dit en revanche
 * si quelqu'un a repondu — aucun evenement n'est emis, ni pour le
 * succes ni pour l'echec. On observe donc la page elle-meme : quand
 * WhatsApp prend la main, elle passe en arriere-plan ou perd le focus.
 * Si au bout de deux secondes elle est toujours au premier plan, c'est
 * que personne n'a decroche — WhatsApp n'est pas installe sur cette
 * machine — et wa.me prend le relais dans le navigateur.
 *
 * Le pire cas est un onglet de trop, jamais un bouton sans effet.
 */
export function openWhatsapp(appUrl: string, webUrl: string): void {
  window.location.assign(appUrl);
  window.setTimeout(() => {
    const auPremierPlan =
      document.visibilityState === "visible" && document.hasFocus();
    if (auPremierPlan) openOutside(webUrl);
  }, DELAI_DE_REPLI);
}
