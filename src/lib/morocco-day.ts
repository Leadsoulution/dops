/**
 * La journee marocaine, partout la meme.
 *
 * "Aujourd'hui" se decidait jusqu'ici avec l'horloge de la machine qui
 * posait la question. Le navigateur d'un poste regle sur Paris ouvrait
 * sa journee une heure avant celle de Casablanca, le serveur tourne en
 * UTC et l'ouvrait une heure apres, et les dates des depenses
 * publicitaires arrivent, elles, dans le fuseau du compte. Trois
 * horloges pour un seul mot.
 *
 * Tout passe desormais par ce module. La journee commence a minuit a
 * Casablanca, pour les commandes, les relances, les statistiques et
 * les depenses — quel que soit le poste qui regarde.
 *
 * Le decalage n'est pas ecrit en dur. Le Maroc vit a UTC+1 toute
 * l'annee, mais revient a UTC+0 pendant le ramadan : une constante
 * aurait fausse un mois par an, et personne n'aurait compris pourquoi.
 */

const FUSEAU = "Africa/Casablanca";

const PARTIES = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSEAU,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function lire(at: Date) {
  const p = Object.fromEntries(
    PARTIES.formatToParts(at).map((x) => [x.type, x.value])
  );
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    // Minuit se lit "24" dans certaines versions : on le ramene a 0.
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/**
 * Le decalage du Maroc sur UTC a cet instant, en minutes.
 *
 * Mesure plutot que suppose : on relit l'instant tel qu'il s'affiche
 * a Casablanca, on fait comme si ces chiffres etaient de l'UTC, et la
 * difference est le decalage.
 */
export function moroccoOffsetMinutes(at: Date = new Date()): number {
  const p = lire(at);
  const commeUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second
  );
  return Math.round((commeUtc - at.getTime() / 1000 * 1000) / 60000);
}

/** La date du calendrier marocain a cet instant, "AAAA-MM-JJ". */
export function moroccoDate(at: Date = new Date()): string {
  const p = lire(at);
  const deux = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${deux(p.month)}-${deux(p.day)}`;
}

/**
 * L'instant ou commence une journee marocaine donnee.
 *
 * Deux passes : le decalage depend de l'instant qu'on cherche, et on
 * ne le connait pas encore. La premiere estimation suffit a tomber
 * dans la bonne journee, la seconde corrige le jour d'un changement
 * d'heure.
 */
export function moroccoDayStart(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const naif = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  const premier = new Date(naif - moroccoOffsetMinutes(new Date(naif)) * 60000);
  return new Date(naif - moroccoOffsetMinutes(premier) * 60000);
}

/** Le dernier instant d'une journee marocaine. */
export function moroccoDayEnd(day: string): Date {
  // Le debut du lendemain, moins un millieme de seconde : une journee
  // dure vingt-trois ou vingt-cinq heures les jours de changement
  // d'heure, et ajouter vingt-quatre heures en perdrait une.
  const [y, m, d] = day.split("-").map(Number);
  const lendemain = new Date(Date.UTC(y, m - 1, d + 1));
  return new Date(moroccoDayStart(moroccoDate(lendemain)).getTime() - 1);
}

/** La date marocaine decalee de `delta` jours. */
export function moroccoDateShift(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const deplace = new Date(Date.UTC(y, m - 1, d + delta));
  const deux = (n: number) => String(n).padStart(2, "0");
  return `${deplace.getUTCFullYear()}-${deux(deplace.getUTCMonth() + 1)}-${deux(
    deplace.getUTCDate()
  )}`;
}

/** Le premier jour du mois marocain en cours. */
export function moroccoMonthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

/** Les bornes d'une plage de journees marocaines, en instants ISO. */
export function moroccoSpan(
  firstDay: string,
  lastDay: string
): { from: string; to: string } {
  return {
    from: moroccoDayStart(firstDay).toISOString(),
    to: moroccoDayEnd(lastDay).toISOString(),
  };
}
