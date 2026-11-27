/**
 * Import dans le nouveau projet Supabase.
 *
 * Lit les fichiers produits par `migration-export.mjs` et les joue sur
 * le projet decrit par `.env.nouveau`, via la meme interface
 * d'administration que l'export — aucun outil Postgres n'est requis.
 *
 * Les envois sont decoupes : une requete de huit megaoctets serait
 * refusee. Le schema part d'un bloc (les corps de fonctions contiennent
 * des points-virgules et ne se coupent pas), les donnees par paquets
 * d'instructions completes.
 *
 * Rejouable : le schema est en "if not exists", les donnees en
 * "on conflict do nothing". Un import interrompu se reprend.
 */
import fs from "node:fs";

const DOSSIER = process.argv[2];
if (!DOSSIER) {
  console.error("usage : node migration-import.mjs <dossier des fichiers SQL>");
  process.exit(1);
}

const env = Object.fromEntries(
  fs
    .readFileSync(".env.nouveau", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const manque = ["NOUVEAU_SUPABASE_URL", "NOUVEAU_ACCESS_TOKEN"].filter((k) => !env[k]);
if (manque.length > 0) {
  console.error("Il manque dans .env.nouveau :", manque.join(", "));
  process.exit(1);
}

const ref = new URL(env.NOUVEAU_SUPABASE_URL).host.split(".")[0];

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(query) {
  for (let essai = 0; ; essai += 1) {
    try {
      const r = await envoyer(query);
      await pause(350);
      return r;
    } catch (e) {
      // L'interface d'administration limite les appels par minute.
      const trop = /429|Too Many Requests/.test(e.message);
      if (!trop || essai >= 6) throw e;
      await pause(3000 * (essai + 1));
    }
  }
}

async function envoyer(query) {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.NOUVEAU_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  );
  const texte = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} ${texte.slice(0, 400)}`);
  return texte;
}

/** Regroupe des instructions completes en envois d'au plus 400 ko. */
function paquets(instructions, max = 400_000) {
  const lots = [];
  let courant = [];
  let poids = 0;
  for (const i of instructions) {
    if (poids + i.length > max && courant.length > 0) {
      lots.push(courant.join("\n"));
      courant = [];
      poids = 0;
    }
    courant.push(i);
    poids += i.length;
  }
  if (courant.length > 0) lots.push(courant.join("\n"));
  return lots;
}

async function jouer(nom, instructions) {
  const lots = paquets(instructions);
  let fait = 0;
  for (const [i, lot] of lots.entries()) {
    try {
      await run(lot);
    } catch (e) {
      console.error(`  ! ${nom} paquet ${i + 1}/${lots.length} refuse : ${e.message}`);
      throw e;
    }
    fait += 1;
    process.stdout.write(`\r  ${nom} : ${fait}/${lots.length} paquets`);
  }
  console.log(`\r  ${nom} : ${lots.length} paquets joues.        `);
}

const lire = (f) => fs.readFileSync(`${DOSSIER}/${f}`, "utf8");

console.log("Projet cible :", ref);

// Le schema d'un bloc : les corps de fonctions ne se decoupent pas.
console.log("1/3 structure");
await run(lire("01-schema.sql"));
console.log("  structure creee.");

// Les comptes avant les donnees : `profiles` pointe vers `auth.users`,
// et la fiche d'un agent sans son compte serait refusee.
console.log("2/3 comptes de connexion");
await jouer(
  "comptes",
  lire("03-comptes.sql")
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean)
);

console.log("3/3 donnees");
await jouer(
  "donnees",
  lire("02-donnees.sql")
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
);

// Verification : on recompte de l'autre cote.
const compte = await run(`select
    (select count(*) from public.leads) as commandes,
    (select count(*) from public.cities) as villes,
    (select count(*) from public.carrier_cities) as villes_transporteur,
    (select count(*) from public.lead_events) as journal,
    (select count(*) from public.products) as produits,
    (select count(*) from public.profiles) as profils,
    (select count(*) from auth.users) as comptes`);
console.log("Dans le nouveau projet :", compte);
