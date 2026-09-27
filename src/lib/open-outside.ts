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
