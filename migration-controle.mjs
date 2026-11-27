/**
 * Controle d'apres-migration.
 *
 * Le comptage des lignes ne prouve pas grand-chose : une colonne
 * tableau mal recopiee, un jsonb vide, une date decalee passeraient
 * inapercus. On compare donc une empreinte du contenu de chaque table,
 * calculee des deux cotes par Postgres lui-meme.
 *
 * Les tables que l'application fait vivre depuis la bascule sont
 * comparees sur les seules lignes anterieures : les commandes arrivees
 * depuis n'existent evidemment que d'un cote.
 */
import fs from "node:fs";

const lire = (f) =>
  Object.fromEntries(
    fs
      .readFileSync(f, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
  );

const nouveau = lire(".env.local");
const ancien = lire(".env.local.ancien");
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function interroger(url, token) {
  const ref = new URL(url).host.split(".")[0];
  return async (query) => {
    for (let essai = 0; ; essai += 1) {
      const r = await fetch(
        `https://api.supabase.com/v1/projects/${ref}/database/query`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        }
      );
      const t = await r.text();
      if (r.ok) {
        await pause(400);
        return JSON.parse(t);
      }
      if (r.status !== 429 || essai >= 6) throw new Error(`HTTP ${r.status} ${t.slice(0, 160)}`);
      await pause(3000 * (essai + 1));
    }
  };
}

const source = interroger(ancien.NEXT_PUBLIC_SUPABASE_URL, ancien.SUPABASE_ACCESS_TOKEN);
const cible = interroger(nouveau.NEXT_PUBLIC_SUPABASE_URL, nouveau.SUPABASE_ACCESS_TOKEN);

/** Tables que l'application alimente depuis la bascule. */
const VIVANTES = new Set([
  "leads",
  "lead_events",
  "lead_follow_ups",
  "webhook_deliveries",
  "push_subscriptions",
  "integration_settings",
]);
const COUPURE = "2026-11-27 01:00:00+00";

const tables = (
  await source(`select c.relname as nom from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relkind='r' order by c.relname`)
).map((t) => t.nom);

console.log("table".padEnd(24), "lignes".padStart(8), "empreinte", "  verdict");
let soucis = [];

for (const table of tables) {
  if (table === "webhook_deliveries") {
    console.log(table.padEnd(24), "— journal des envois, volontairement non copie");
    continue;
  }

  // Une colonne de date de creation existe presque partout ; sinon on
  // compare tout.
  const [{ a_date }] = await source(
    `select count(*) > 0 as a_date from information_schema.columns
      where table_schema='public' and table_name='${table}' and column_name='created_at'`
  );
  const filtre =
    VIVANTES.has(table) && a_date ? ` where created_at < '${COUPURE}'` : "";

  const requete = `select count(*)::int as n,
      coalesce(md5(string_agg(md5(t::text), '' order by md5(t::text))), 'vide') as empreinte
     from public."${table}" t${filtre}`;

  const [av] = await source(requete);
  const [ap] = await cible(requete);

  const memeNombre = av.n === ap.n;
  const memeContenu = av.empreinte === ap.empreinte;
  const verdict = memeNombre && memeContenu
    ? "identique"
    : memeNombre
      ? "CONTENU DIFFERENT"
      : `MANQUE ${av.n - ap.n} ligne(s)`;
  if (!(memeNombre && memeContenu)) soucis.push(`${table} : ${verdict}`);
  console.log(
    table.padEnd(24),
    String(av.n).padStart(8),
    memeContenu ? "   ==   " : "   !=   ",
    verdict + (filtre ? "  (lignes d'avant la bascule)" : "")
  );
}

console.log(
  "\n" + (soucis.length === 0 ? "Tout le contenu concorde." : "A regarder : " + soucis.join(" | "))
);
