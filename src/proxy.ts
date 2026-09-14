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
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/forcelog/webhook",
  "/api/woocommerce/webhook",
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // Sans configuration Supabase il n'y a pas d'authentification possible :
  // laisser passer plutot que de verrouiller toute l'application.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value, options } of list) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|.*\.png$|.*\.svg$).*)"],
};
