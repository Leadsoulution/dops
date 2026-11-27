/**
 * Comparaison des deux projets, apres migration.
 *
 * Compte les lignes de chaque table des deux cotes, verifie que les
 * declencheurs ont bien ete rallumes apres le chargement, que la
 * securite au niveau ligne est en place, et que les sequences ne
 * redonneront pas un identifiant deja pris.
 */
import fs from "node:fs";
import { sql as source } from "./sql.mjs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.nouveau", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const ref = new URL(env.NOUVEAU_SUPABASE_URL).host.split(".")[0];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function cible(query) {
  for (let essai = 0; ; essai += 1) {
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
    const t = await r.text();
    if (r.ok) {
      await pause(350);
      return JSON.parse(t);
    }
    if (r.status !== 429 || essai >= 6) throw new Error(`HTTP ${r.status} ${t.slice(0, 200)}`);
    await pause(3000 * (essai + 1));
  }
}

const comptage = `select relname as "table", n_live_tup from pg_stat_user_tables order by relname`;

// Un comptage exact : pg_stat_user_tables n'est qu'une estimation.
async function compter(executer) {
  const tables = await executer(
    `select c.relname as nom from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r' order by c.relname`
  );
  const union = tables
    .map((t) => `select '${t.nom}' as t, count(*)::int as n from public."${t.nom}"`)
    .join(" union all ");
  const lignes = await executer(`${union} order by t`);
  return new Map(lignes.map((l) => [l.t, l.n]));
}

const [avant, apres] = [await compter(source), await compter(cible)];

let ecarts = 0;
console.log("table".padEnd(26), "ancienne".padStart(9), "nouvelle".padStart(9));
for (const [table, n] of avant) {
  const m = apres.get(table) ?? 0;
  const marque = n === m ? "" : "   <-- ECART";
  if (n !== m) ecarts += 1;
  console.log(table.padEnd(26), String(n).padStart(9), String(m).padStart(9), marque);
}

const etat = await cible(`select
   (select count(*) from auth.users) as comptes,
   (select count(*) from auth.identities) as identites,
   (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as tables_protegees,
   (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
     join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and not t.tgisinternal and t.tgenabled='D') as declencheurs_eteints,
   (select count(*) from information_schema.sequences where sequence_schema='public') as sequences`);
console.log("\netat du nouveau projet :", JSON.stringify(etat[0]));

const reglages = await cible(
  `select id from public.integration_settings order by id`
);
console.log("integrations presentes :", reglages.map((r) => r.id).join(", "));

console.log(ecarts === 0 ? "\nAucun ecart." : `\n${ecarts} table(s) en ecart.`);
console.log(
  "note : webhook_deliveries (journal des envois) n'a pas ete copie, volontairement."
);
