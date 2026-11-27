/**
 * Export de la base Orderly, par l'interface d'administration Supabase.
 *
 * L'API publique du projet est bridee (quota de trafic depasse) mais la
 * base reste interrogeable par l'interface d'administration : c'est par
 * la que tout sort. Aucun outil Postgres n'est installe sur la machine,
 * donc le schema est reconstruit a partir du catalogue — Postgres sait
 * rendre lui-meme la definition exacte d'une contrainte, d'un index,
 * d'un declencheur ou d'une fonction, et c'est ce qu'on lui demande.
 *
 * N'ecrit rien dans la base source. Produit deux fichiers SQL.
 */
import fs from "node:fs";
import { sql as requeteBrute } from "./sql.mjs";

/**
 * L'interface d'administration limite le nombre d'appels par minute.
 * Un export en fait plusieurs dizaines : on espace, et on patiente plus
 * longtemps quand elle repond quand meme "trop de requetes".
 */
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function sql(query) {
  for (let essai = 0; ; essai += 1) {
    try {
      const r = await requeteBrute(query);
      await pause(350);
      return r;
    } catch (e) {
      const trop = /429|Too Many Requests/.test(e.message);
      if (!trop || essai >= 6) throw e;
      await pause(3000 * (essai + 1));
    }
  }
}

const SORTIE = process.argv[2];
if (!SORTIE) {
  console.error("usage : node migration-export.mjs <dossier de sortie>");
  process.exit(1);
}
fs.mkdirSync(SORTIE, { recursive: true });

/** Tables de journal : volumineuses et sans valeur une fois le colis parti. */
const SANS_DONNEES = new Set(process.env.SANS_DONNEES?.split(",") ?? []);

const guillemets = (nom) => `"${nom.replace(/"/g, '""')}"`;

const citation = (texte) => `'${String(texte).replace(/'/g, "''")}'`;

/**
 * Un element de tableau Postgres : guillemets doubles, antislash
 * echappe. Sans cela, une ville nommee « Sidi "X" » casserait la
 * ligne entiere.
 */
function elementTableau(x) {
  if (x === null || x === undefined) return "NULL";
  const echappe = String(x).split("\\").join("\\\\").split('"').join('\\"');
  return `"${echappe}"`;
}

/**
 * Une valeur Postgres, telle qu'on peut la recoller dans un INSERT.
 *
 * Le type de la colonne tranche un cas que la valeur seule ne dit pas :
 * l'interface d'administration rend aussi bien un tableau `text[]`
 * qu'un `jsonb` sous forme de tableau JavaScript, et les deux ne
 * s'ecrivent pas pareil — `{a,b}` pour le premier, `[a,b]` pour le
 * second. Les confondre fait refuser la ligne.
 */
function litteral(v, type = "") {
  if (v === null || v === undefined) return "NULL";
  const json = type === "json" || type === "jsonb";
  if (type.endsWith("[]") || (Array.isArray(v) && !json)) {
    const liste = Array.isArray(v) ? v : [v];
    return citation(`{${liste.map(elementTableau).join(",")}}`);
  }
  if (json) return citation(JSON.stringify(v));
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return citation(JSON.stringify(v));
  return citation(v);
}

/** Le type de chaque colonne, par table : litteral() en a besoin. */
async function typesDesColonnes() {
  const lignes = await sql(`
    select c.relname as "table", a.attname as col,
           format_type(a.atttypid, a.atttypmod) as type
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and a.attnum > 0 and not a.attisdropped`);
  const parTable = new Map();
  for (const l of lignes) {
    if (!parTable.has(l.table)) parTable.set(l.table, new Map());
    parTable.get(l.table).set(l.col, l.type);
  }
  return parTable;
}

async function schema() {
  const morceaux = [];
  morceaux.push("-- Schema public de Orderly, extrait du catalogue Postgres.");
  morceaux.push("create extension if not exists pgcrypto;");
  morceaux.push('create extension if not exists "uuid-ossp";');

  // Les tables, colonne par colonne : type rendu par Postgres, valeur
  // par defaut telle qu'elle est stockee, et l'identite quand il y en a.
  const colonnes = await sql(`
    select c.relname as "table", a.attname as col, a.attnum,
           format_type(a.atttypid, a.atttypmod) as type,
           a.attnotnull as notnull,
           pg_get_expr(d.adbin, d.adrelid) as defaut,
           a.attidentity as identite
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where n.nspname = 'public' and c.relkind = 'r'
       and a.attnum > 0 and not a.attisdropped
     order by c.relname, a.attnum`);

  const parTable = new Map();
  for (const c of colonnes) {
    if (!parTable.has(c.table)) parTable.set(c.table, []);
    parTable.get(c.table).push(c);
  }

  for (const [table, cols] of parTable) {
    const lignes = cols.map((c) => {
      let l = `  ${guillemets(c.col)} ${c.type}`;
      if (c.identite === "a") l += " generated always as identity";
      else if (c.identite === "d") l += " generated by default as identity";
      else if (c.defaut) l += ` default ${c.defaut}`;
      if (c.notnull) l += " not null";
      return l;
    });
    morceaux.push(
      `create table if not exists public.${guillemets(table)} (\n${lignes.join(",\n")}\n);`
    );
  }

  // Contraintes : cles primaires d'abord, le reste ensuite, parce qu'une
  // cle etrangere a besoin que la cle visee existe deja.
  const contraintes = await sql(`
    select c.relname as "table", con.conname as nom, con.contype as genre,
           pg_get_constraintdef(con.oid) as def
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
     order by case con.contype when 'p' then 0 when 'u' then 1 when 'c' then 2 else 3 end,
              c.relname, con.conname`);
  /*
   * Posees seulement si elles manquent.
   *
   * Un import interrompu se reprend : rejouer un "add constraint" sur
   * une cle primaire deja posee arrete tout, et il faudrait alors
   * repartir d'une base vide.
   */
  for (const k of contraintes) {
    morceaux.push(
      `do $idem$ begin
  if not exists (select 1 from pg_constraint where conname = ${litteral(k.nom)}
                   and conrelid = 'public.${k.table}'::regclass) then
    alter table public.${guillemets(k.table)} add constraint ${guillemets(k.nom)} ${k.def};
  end if;
end $idem$;`
    );
  }

  // Index hors contraintes : celles-ci creent deja les leurs.
  const index = await sql(`
    select i.indexdef as def
      from pg_indexes i
     where i.schemaname = 'public'
       and not exists (
         select 1 from pg_constraint con
          join pg_class c on c.oid = con.conrelid
         where con.conname = i.indexname and c.relname = i.tablename)
     order by i.tablename, i.indexname`);
  for (const i of index) {
    // Meme raison : un index deja cree ne doit pas faire echouer la reprise.
    morceaux.push(
      `${i.def.replace(/^create (unique )?index /i, (m, u) => `create ${u ?? ""}index if not exists `)};`
    );
  }

  // Fonctions avant declencheurs : un declencheur nomme sa fonction.
  const fonctions = await sql(`
    select pg_get_functiondef(p.oid) as def
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
     order by p.proname`);
  for (const f of fonctions) morceaux.push(`${f.def};`);

  const declencheurs = await sql(`
    select pg_get_triggerdef(t.oid) as def
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and not t.tgisinternal
     order by c.relname, t.tgname`);
  for (const d of declencheurs) {
    morceaux.push(`${d.def.replace(/^create trigger /i, "create or replace trigger ")};`);
  }

  // La securite au niveau ligne est active partout sur la source, sans
  // aucune politique : seule la cle de service passe. A reproduire tel
  // quel, sinon la base neuve serait ouverte.
  const rls = await sql(`
    select c.relname as "table"
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
     order by c.relname`);
  for (const t of rls) {
    morceaux.push(
      `alter table public.${guillemets(t.table)} enable row level security;`
    );
  }

  const politiques = await sql(`
    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      from pg_policies where schemaname = 'public'`);
  if (politiques.length > 0) {
    morceaux.push(`-- ATTENTION : ${politiques.length} politiques a reporter a la main.`);
  }

  // Les droits, pour que la cle de service et les roles de l'API
  // retrouvent exactement ce qu'ils avaient.
  const droits = await sql(`
    select table_name, grantee, string_agg(distinct privilege_type, ', ') as droits
      from information_schema.role_table_grants
     where table_schema = 'public'
       and grantee in ('anon','authenticated','service_role','postgres')
     group by table_name, grantee
     order by table_name, grantee`);
  for (const g of droits) {
    morceaux.push(
      `grant ${g.droits} on table public.${guillemets(g.table_name)} to ${g.grantee};`
    );
  }

  return morceaux.join("\n\n");
}

/** Les tables rangees pour que personne n'arrive avant ce qu'elle vise. */
async function ordreDeChargement() {
  const tables = (
    await sql(`select c.relname as nom from pg_class c
                 join pg_namespace n on n.oid = c.relnamespace
                where n.nspname='public' and c.relkind='r' order by c.relname`)
  ).map((t) => t.nom);

  const liens = await sql(`
    select c.relname as enfant, f.relname as parent
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_class f on f.oid = con.confrelid
      join pg_namespace n on n.oid = c.relnamespace
     where con.contype = 'f' and n.nspname = 'public'`);

  const besoins = new Map(tables.map((t) => [t, new Set()]));
  for (const l of liens) {
    if (l.enfant !== l.parent) besoins.get(l.enfant)?.add(l.parent);
  }

  const ordre = [];
  const restantes = new Set(tables);
  while (restantes.size > 0) {
    const prete = [...restantes].find((t) =>
      [...besoins.get(t)].every((p) => !restantes.has(p))
    );
    // Cycle entre tables : on tranche, les declencheurs seront coupes
    // pendant le chargement de toute facon.
    const choisie = prete ?? [...restantes][0];
    ordre.push(choisie);
    restantes.delete(choisie);
  }
  return ordre;
}

async function donnees(ordre, types) {
  const morceaux = [];
  const resume = [];
  for (const table of ordre) {
    if (SANS_DONNEES.has(table)) {
      resume.push(`${table} : ignoree`);
      continue;
    }
    const [{ n }] = await sql(`select count(*)::int as n from public.${guillemets(table)}`);
    resume.push(`${table} : ${n}`);
    if (n === 0) continue;

    morceaux.push(`alter table public.${guillemets(table)} disable trigger user;`);

    const PAS = 500;
    for (let debut = 0; debut < n; debut += PAS) {
      const lignes = await sql(
        `select * from public.${guillemets(table)} order by 1 limit ${PAS} offset ${debut}`
      );
      if (lignes.length === 0) break;
      const cols = Object.keys(lignes[0]);
      const valeurs = lignes
        .map((l) => `(${cols.map((c) => litteral(l[c])).join(", ")})`)
        .join(",\n  ");
      morceaux.push(
        `insert into public.${guillemets(table)} (${cols
          .map(guillemets)
          .join(", ")}) values\n  ${valeurs}\non conflict do nothing;`
      );
    }

    morceaux.push(`alter table public.${guillemets(table)} enable trigger user;`);
  }
  return { sql: morceaux.join("\n\n"), resume };
}

/**
 * Les comptes de connexion.
 *
 * Les mots de passe suivent sous leur forme chiffree : ils continueront
 * de fonctionner tels quels. `auth.identities` est indispensable — sans
 * elle, GoTrue ne reconnait plus la connexion par mot de passe.
 */
async function comptes() {
  const morceaux = [];
  const typesAuth = new Map();
  /*
   * Les colonnes calculees sont exclues.
   *
   * `auth.users.confirmed_at` est derivee des deux dates de
   * confirmation : Postgres refuse qu'on lui dicte sa valeur, et la
   * ligne entiere serait rejetee.
   */
  const generees = new Set();
  for (const l of await sql(`
    select c.relname as "table", a.attname as col,
           format_type(a.atttypid, a.atttypmod) as type,
           a.attgenerated as calculee
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'auth' and c.relname in ('users','identities')
       and a.attnum > 0 and not a.attisdropped`)) {
    typesAuth.set(`${l.table}.${l.col}`, l.type);
    if (l.calculee) generees.add(`${l.table}.${l.col}`);
  }
  const users = await sql(`select * from auth.users order by created_at`);
  for (const u of users) {
    const cols = Object.keys(u).filter(
      (c) => u[c] !== null && !generees.has(`users.${c}`)
    );
    morceaux.push(
      `insert into auth.users (${cols.map(guillemets).join(", ")}) values (${cols
        .map((c) => litteral(u[c], typesAuth.get(`users.${c}`) ?? ""))
        .join(", ")}) on conflict (id) do nothing;`
    );
  }
  const identites = await sql(`select * from auth.identities order by created_at`);
  for (const i of identites) {
    const cols = Object.keys(i).filter(
      (c) => i[c] !== null && !generees.has(`identities.${c}`)
    );
    morceaux.push(
      `insert into auth.identities (${cols.map(guillemets).join(", ")}) values (${cols
        .map((c) => litteral(i[c], typesAuth.get(`identities.${c}`) ?? ""))
        .join(", ")}) on conflict (id) do nothing;`
    );
  }
  return { sql: morceaux.join("\n"), nb: users.length };
}

const ordre = await ordreDeChargement();
fs.writeFileSync(`${SORTIE}/01-schema.sql`, await schema(), "utf8");
const types = await typesDesColonnes();
const d = await donnees(ordre, types);
fs.writeFileSync(`${SORTIE}/02-donnees.sql`, d.sql, "utf8");
const c = await comptes();
fs.writeFileSync(`${SORTIE}/03-comptes.sql`, c.sql, "utf8");

console.log("ordre de chargement :", ordre.join(" > "));
console.log("lignes par table :", d.resume.join(" | "));
console.log("comptes de connexion :", c.nb);
for (const f of ["01-schema.sql", "02-donnees.sql", "03-comptes.sql"]) {
  console.log(f, "->", (fs.statSync(`${SORTIE}/${f}`).size / 1024).toFixed(0), "ko");
}
