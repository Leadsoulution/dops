import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();

/** Les rappels de cookies que le garde confie a Supabase. */
type CookieHooks = {
  getAll: () => unknown[];
  setAll: (list: { name: string; value: string; options?: object }[]) => void;
};
let hooks: CookieHooks | null = null;

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: { cookies: CookieHooks }
  ) => {
    hooks = options.cookies;
    return { auth: { getUser } };
  },
}));

import { proxy } from "./proxy";

/**
 * Une requete entrante minimale, de la forme que le garde consomme :
 * cookies, URL et chemin.
 */
function request(pathname: string) {
  const url = new URL(`https://orderly.host${pathname}`);
  return {
    cookies: { getAll: () => [], set: vi.fn() },
    nextUrl: { pathname: url.pathname, search: url.search },
    url: url.toString(),
    headers: new Headers(),
  } as never;
}

beforeEach(() => {
  getUser.mockReset();
  hooks = null;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "clef";
});

describe("proxy", () => {
  it("transmet le jeton rafraichi a la route, pas seulement au navigateur", async () => {
    const req = request("/api/settings/whatsapp");
    getUser.mockImplementation(async () => {
      // Supabase renouvelle le jeton au passage, comme il le fait des
      // que l'ancien approche de sa fin.
      hooks?.setAll([{ name: "sb-jeton", value: "neuf", options: {} }]);
      return { data: { user: { id: "u1" } }, error: null };
    });

    await proxy(req);

    // La route lit la requete, jamais la reponse. Sans cette ligne, elle
    // voit encore le jeton perime et refuse une personne connectee :
    // c'est ce qui faisait echouer un enregistrement tardif.
    expect(
      (req as unknown as { cookies: { set: ReturnType<typeof vi.fn> } }).cookies
        .set
    ).toHaveBeenCalledWith("sb-jeton", "neuf");
  });

  it("laisse un client ouvrir le suivi de son colis sans compte", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await proxy(request("/suivi-F-ALR26MY1QM91"));
    // Le garde s'execute avant les reecritures : il voit "/suivi-F-...",
    // jamais la forme interne "/suivi/F-...". Sans cette regle, le lien
    // envoye par WhatsApp menait le client a une page de connexion.
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("laisse passer une personne connectee", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const res = await proxy(request("/"));
    expect(res.status).toBe(200);
  });

  it("renvoie vers /login quand la session est refusee", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { status: 401, message: "invalid JWT" },
    });
    const res = await proxy(request("/products"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("renvoie vers /login quand il n'y a simplement personne", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await proxy(request("/products"));
    expect(res.status).toBe(307);
  });

  it("repond 401 en JSON plutot que de rediriger une requete d'API", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await proxy(request("/api/leads"));
    expect(res.status).toBe(401);
  });

  // Le coeur du correctif : une panne Supabase ne doit ni faire tomber la
  // page, ni deconnecter tout le monde.
  it("laisse passer quand Supabase est injoignable", async () => {
    getUser.mockRejectedValue(new TypeError("fetch failed"));
    const res = await proxy(request("/"));
    expect(res.status).toBe(200);
  });

  it("laisse passer quand Supabase repond une erreur reseau sans code", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Failed to fetch" },
    });
    const res = await proxy(request("/products"));
    expect(res.status).toBe(200);
  });

  it("laisse passer quand Supabase est en panne (5xx)", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { status: 503, message: "service unavailable" },
    });
    const res = await proxy(request("/products"));
    expect(res.status).toBe(200);
  });

  it("ne redirige jamais /login en boucle pour un visiteur", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await proxy(request("/login"));
    expect(res.status).toBe(200);
  });

  it("renvoie une personne connectee de /login vers l'accueil", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const res = await proxy(request("/login"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://orderly.host/");
  });

  it("garde la page demandee pour y revenir apres connexion", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await proxy(request("/products"));
    expect(res.headers.get("location")).toContain("suite=%2Fproducts");
  });
});
