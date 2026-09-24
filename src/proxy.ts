import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Garde d'entree de l'application.
 *
 * Rafraichit le jeton Supabase a chaque requete et renvoie vers /login
 * quiconque n'est pas connecte. C'est une verification optimiste, comme
 * le recommande Next.js : elle evite d'afficher une page vide a un
 * visiteur non connecte, mais l'autorisation reelle est refaite cote
 * serveur dans chaque route d'API.
 */

// La boutique et le transporteur appellent ces adresses sans session.
//
// Le suivi de colis s'y ajoute pour une autre raison : c'est une page
// faite pour les clients, dont l'adresse leur est envoyee par WhatsApp.
// Elle ne montre que l'avancement d'un colis, sa ville et sa nature —
// jamais de telephone, d'adresse ni de montant.
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/forcelog/webhook",
  "/api/woocommerce/webhook",
];

/**
 * Le suivi de colis, dont le code tient dans le meme segment que le
 * chemin : "/suivi-F-XXXX".
 *
 * Il ne peut pas figurer dans la liste ci-dessus. Le garde s'execute
 * avant les reecritures de `next.config`, et voit donc l'adresse
 * d'origine, jamais le "/suivi/F-XXXX" interne — une entree "/suivi"
 * ne correspondrait a rien et renverrait le client vers la page de
 * connexion.
 */
const SUIVI_PREFIX = "/suivi-";

function isPublic(pathname: string) {
  if (pathname.startsWith(SUIVI_PREFIX) || pathname.startsWith("/suivi/")) {
    return true;
  }
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Supabase a-t-il vraiment refuse la session, ou n'a-t-il pas repondu ?
 *
 * Un refus porte un code HTTP de la famille 4xx : jeton expire, absent ou
 * invalide. Tout le reste — pas de code du tout, ou une erreur 5xx — dit
 * que la question n'a pas pu etre posee, et ne prouve rien sur la
 * personne qui navigue.
 */
function isRejectedSession(error: { status?: number }): boolean {
  return (
    typeof error.status === "number" && error.status >= 400 && error.status < 500
  );
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // Sans configuration Supabase il n'y a pas d'authentification possible :
  // laisser passer plutot que de verrouiller toute l'application.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        // Un jeton rafraichi doit repartir dans les deux sens.
        //
        // Vers le navigateur par la reponse, c'est evident. Mais aussi
        // vers la route appelee, en reecrivant les cookies de la
        // requete : la route lit la requete, pas la reponse. Sans cela
        // elle continue de voir le jeton perime que le navigateur vient
        // d'envoyer, et refuse une personne pourtant connectee.
        //
        // C'est ce qui faisait echouer un enregistrement fait apres une
        // heure passee sur la meme page : la lecture initiale avait
        // reussi, l'ecriture partait avec un jeton expire, et le refus
        // ressemblait a un reglage qui ne se sauvegarde pas.
        for (const { name, value } of list) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // `getUser()` interroge le serveur d'authentification Supabase a chaque
  // requete. Une coupure reseau, un delai depasse ou une panne de leur
  // cote ne doit pas emporter la page avec elle : sans ce filet, l'erreur
  // remonte, Next.js repond 500, et le navigateur affiche une page morte
  // — c'est exactement l'incident intermittent observe sur telephone.
  //
  // On distingue donc deux situations. Une session refusee : la personne
  // n'est pas connectee, on la renvoie vers /login. Un serveur
  // injoignable : on ne sait rien, et on laisse passer. Cette garde est
  // optimiste par construction, l'autorisation reelle etant refaite dans
  // chaque route d'API — qui echouera elle aussi proprement si Supabase
  // reste muet. Mieux vaut une page vide qu'une page morte, et surtout
  // pas de deconnexion en rafale a chaque hoquet du reseau.
  let user = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error && !isRejectedSession(error)) return response;
    user = data?.user ?? null;
  } catch {
    return response;
  }

  const { pathname, search } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    // Une requete d'API attend du JSON : la renvoyer vers une page de
    // connexion lui ferait recevoir du HTML avec un code 200, que le code
    // appelant prendrait pour un succes.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Non connecte." }, { status: 401 });
    }

    const login = new URL("/login", request.url);
    // Memorise la page demandee pour y revenir apres la connexion.
    if (pathname !== "/") login.searchParams.set("suite", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  // Tout sauf les fichiers statiques et les images : inutile de verifier
  // une session pour servir un logo.
  // Le manifeste et l'agent de service doivent rester joignables sans
  // session : le navigateur les demande avant toute connexion, et une
  // redirection vers /login empecherait l'installation.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon.png|apple-icon.png|.*\.png$|.*\.svg$).*)",
  ],
};
