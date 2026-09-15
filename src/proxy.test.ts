import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser } }),
}));

import { proxy } from "./proxy";

/**
 * Une requete entrante minimale, de la forme que le garde consomme :
 * cookies, URL et chemin.
 */
function request(pathname: string) {
  const url = new URL(`https://orderly.host${pathname}`);
  return {
    cookies: { getAll: () => [] },
    nextUrl: { pathname: url.pathname, search: url.search },
    url: url.toString(),
    headers: new Headers(),
  } as never;
}

beforeEach(() => {
  getUser.mockReset();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "clef";
});

describe("proxy", () => {
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
