-- Journal des modifications d'une commande
--
-- Qui a change quoi, et quand. La question se pose des qu'une equipe
-- travaille a plusieurs sur les memes commandes : sans trace, un statut
-- qui change reste sans explication.
--
-- L'auteur est enregistre par son nom et non par son identifiant seul :
-- un compte supprime laisserait sinon un journal anonyme, et l'histoire
-- d'une commande ne doit pas dependre de la survie d'un compte. Les
-- automates y figurent aussi, sous leur nom : ForceLog, WooCommerce,
-- Google Sheets.

create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  actor_name text not null,
  actor_id uuid references public.profiles (id) on delete set null,
  field text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);

alter table public.lead_events enable row level security;

create index if not exists lead_events_lead_idx
  on public.lead_events (lead_id, created_at desc);

-- Le dernier auteur, garde sur la commande : la liste l'affiche pour
-- chaque ligne, et une jointure par ligne couterait cher pour rien.
alter table public.leads
  add column if not exists last_modified_by text,
  add column if not exists last_modified_at timestamptz;
