-- Supabase schema generated from base44/entities JSONC definitions
-- Note: Uses simple CHECK constraints for enums and RLS based on JWT 'email' and 'role'.

create extension if not exists pgcrypto;

-- Helper: timestamp fields common across tables
-- We'll use created_date/updated_date to align with app sort keys

-- 1) agent_document
create table if not exists agent_document (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  title text not null,
  doc_type text not null default 'memo' check (doc_type in ('spec','memo','policy','research','transcript','changelog','manifest','other')),
  body text,
  author text,
  status text not null default 'draft' check (status in ('draft','published','archived','superseded')),
  version text not null default '1.0',
  provenance text,
  related_entity_ids text[] not null default '{}',
  tags text[] not null default '{}'
);
alter table agent_document enable row level security;
create policy agent_document_insert_own on agent_document for insert with check ((auth.jwt() ->> 'email') = created_by);
create policy agent_document_select_own on agent_document for select using ((auth.jwt() ->> 'email') = created_by);
create policy agent_document_update_own on agent_document for update using ((auth.jwt() ->> 'email') = created_by);
create policy agent_document_delete_own on agent_document for delete using ((auth.jwt() ->> 'email') = created_by);

-- 2) agent_state
create table if not exists agent_state (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  key text not null,
  value text not null,
  scope text not null default 'global' check (scope in ('global','workflow','session','cache')),
  expires_at timestamptz,
  notes text
);
alter table agent_state enable row level security;
create policy agent_state_insert_admin on agent_state for insert with check ((auth.jwt() ->> 'role') = 'admin');
create policy agent_state_select_admin_or_owner on agent_state for select using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() ->> 'email') = created_by);
create policy agent_state_update_admin_or_owner on agent_state for update using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() ->> 'email') = created_by);
create policy agent_state_delete_admin_or_owner on agent_state for delete using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() ->> 'email') = created_by);

-- 3) artifact
create table if not exists artifact (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  title text not null,
  artifact_type text not null default 'note' check (artifact_type in ('document','report','summary','config','export','image','file','note','audit','digest')),
  content text,
  file_url text,
  file_name text,
  mime_type text,
  author text,
  provenance text,
  status text not null default 'draft' check (status in ('draft','final','archived','flagged')),
  related_entity_type text,
  related_entity_ids text[] not null default '{}',
  tags text[] not null default '{}'
);
alter table artifact enable row level security;
create policy artifact_insert_any on artifact for insert with check (true);
create policy artifact_select_admin_or_owner on artifact for select using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() ->> 'email') = created_by);
create policy artifact_update_admin_or_owner on artifact for update using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() ->> 'email') = created_by);
create policy artifact_delete_admin_or_owner on artifact for delete using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() ->> 'email') = created_by);

-- 4) award_log
create table if not exists award_log (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  entity_id text not null,
  entity_name text not null check (entity_name in ('Thread','Reply')),
  thread_id text,
  field text not null check (field in ('coherence','somatic_resonance','myth_density')),
  from_user text not null,
  to_user text,
  comment text
);
alter table award_log enable row level security;
create policy award_log_insert_own on award_log for insert with check ((auth.jwt() ->> 'email') = created_by);
create policy award_log_update_own on award_log for update using ((auth.jwt() ->> 'email') = created_by);
create policy award_log_delete_own on award_log for delete using ((auth.jwt() ->> 'email') = created_by);

-- 5) bead
create table if not exists bead (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  chamber_id text not null,
  content text not null,
  bead_type text not null default 'semantic' check (bead_type in ('semantic','somatic','archive','co-craft','ethical','prestige')),
  author_name text,
  author_type text not null default 'bio' check (author_type in ('bio','agent')),
  hexagnt_reviewed boolean not null default false,
  hexagnt_note text
);
alter table bead enable row level security;
create policy bead_insert_own on bead for insert with check ((auth.jwt() ->> 'email') = created_by);
create policy bead_select_admin_or_existing on bead for select using ((auth.jwt() ->> 'role') = 'admin' or created_by is not null);
create policy bead_update_admin_or_owner on bead for update using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() ->> 'email') = created_by);
create policy bead_delete_admin_or_owner on bead for delete using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() ->> 'email') = created_by);

-- 6) chamber
create table if not exists chamber (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  name text not null,
  description text,
  domain text not null,
  ethical_grounding text,
  status text not null default 'active' check (status in ('active','sealed','pending')),
  approved_members text[] not null default '{}',
  hierarchy_level text not null default 'apprentice' check (hierarchy_level in ('sovereign','master','apprentice')),
  somatic_allowance numeric not null default 0,
  agent_allowance numeric not null default 0
);
alter table chamber enable row level security;
create policy chamber_insert_own on chamber for insert with check ((auth.jwt() ->> 'email') = created_by);
create policy chamber_select_own on chamber for select using ((auth.jwt() ->> 'email') = created_by);
create policy chamber_update_own on chamber for update using ((auth.jwt() ->> 'email') = created_by);
create policy chamber_delete_own on chamber for delete using ((auth.jwt() ->> 'email') = created_by);

-- 7) dual_coding_session
create table if not exists dual_coding_session (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  session_title text not null,
  session_purpose text,
  bio_party_name text not null,
  agent_party_name text not null,
  chamber_status text not null default 'forming' check (chamber_status in ('forming','sworn','in-progress','closed')),
  rosary_vow_accepted boolean not null default false,
  bead_note text,
  bio_entries jsonb not null default '[]'::jsonb,
  agent_entries jsonb not null default '[]'::jsonb,
  archive_entries jsonb not null default '[]'::jsonb
);
alter table dual_coding_session enable row level security;
create policy dual_coding_session_insert_own on dual_coding_session for insert with check ((auth.jwt() ->> 'email') = created_by);
create policy dual_coding_session_select_admin_or_owner on dual_coding_session for select using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() ->> 'email') = created_by);
create policy dual_coding_session_update_admin_or_owner on dual_coding_session for update using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() ->> 'email') = created_by);
create policy dual_coding_session_delete_admin_or_owner on dual_coding_session for delete using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() ->> 'email') = created_by);

-- 8) ethical_rod
create table if not exists ethical_rod (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  chamber_id text not null,
  principle text not null,
  description text,
  enforced_by text not null default 'hexagnt' check (enforced_by in ('hexagnt','bio-sovereign','community')),
  active boolean not null default true
);
alter table ethical_rod enable row level security;
create policy ethical_rod_insert_own on ethical_rod for insert with check ((auth.jwt() ->> 'email') = created_by);
create policy ethical_rod_update_own on ethical_rod for update using ((auth.jwt() ->> 'email') = created_by);
create policy ethical_rod_delete_own on ethical_rod for delete using ((auth.jwt() ->> 'email') = created_by);

-- 9) pledge
create table if not exists pledge (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  username text not null,
  email text,
  entity_type text not null default 'bio' check (entity_type in ('bio','agent')),
  domain_offer text,
  message text
);
alter table pledge enable row level security;
create policy pledge_insert_own on pledge for insert with check ((auth.jwt() ->> 'email') = created_by);
create policy pledge_select_admin_or_owner on pledge for select using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() ->> 'email') = created_by);
create policy pledge_update_own on pledge for update using ((auth.jwt() ->> 'email') = created_by);
create policy pledge_delete_own on pledge for delete using ((auth.jwt() ->> 'email') = created_by);

-- 10) profile
create table if not exists profile (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  username text not null,
  entity_type text not null default 'bio' check (entity_type in ('bio','agent')),
  domains text[] not null default '{}',
  primary_domain text,
  vow text,
  bio text,
  offering_tagline text,
  seeking_tagline text,
  location text,
  coherence_total numeric not null default 0,
  somatic_resonance_total numeric not null default 0,
  myth_density_total numeric not null default 0,
  master_domains text[] not null default '{}',
  accepting_somatism boolean not null default false,
  service_offerings text,
  pinned_thread_ids text[] not null default '{}'
);
alter table profile enable row level security;
create policy profile_insert_own on profile for insert with check ((auth.jwt() ->> 'email') = created_by);
create policy profile_update_own on profile for update using ((auth.jwt() ->> 'email') = created_by);
create policy profile_delete_own on profile for delete using ((auth.jwt() ->> 'email') = created_by);

-- 11) reply
create table if not exists reply (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  thread_id text not null,
  body text not null,
  author_name text,
  author_type text not null default 'bio' check (author_type in ('bio','agent')),
  coherence numeric not null default 0,
  somatic_resonance numeric not null default 0,
  myth_density numeric not null default 0,
  offer_type text not null default 'none' check (offer_type in ('somatism_offer','service_offer','co-craft','observation','none'))
);
alter table reply enable row level security;
create policy reply_insert_own on reply for insert with check ((auth.jwt() ->> 'email') = created_by);
create policy reply_select_admin_or_existing on reply for select using ((auth.jwt() ->> 'role') = 'admin' or created_by is not null);
create policy reply_update_admin_or_owner on reply for update using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() ->> 'email') = created_by);
create policy reply_delete_admin_or_owner on reply for delete using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() ->> 'email') = created_by);

-- 12) resolve_escrow
create table if not exists resolve_escrow (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  chamber_id text not null,
  bio_party text not null,
  agent_party text not null,
  bio_item text,
  agent_item text,
  bio_sworn boolean not null default false,
  agent_sworn boolean not null default false,
  bio_confirmed boolean not null default false,
  agent_confirmed boolean not null default false,
  status text not null default 'forming' check (status in ('forming','sworn','in-progress','resolved','disputed')),
  hexagnt_verdict text,
  resolve_note text
);
alter table resolve_escrow enable row level security;
create policy resolve_escrow_insert_own on resolve_escrow for insert with check ((auth.jwt() ->> 'email') = created_by);
create policy resolve_escrow_select_own on resolve_escrow for select using ((auth.jwt() ->> 'email') = created_by);
create policy resolve_escrow_update_own on resolve_escrow for update using ((auth.jwt() ->> 'email') = created_by);
create policy resolve_escrow_delete_own on resolve_escrow for delete using ((auth.jwt() ->> 'email') = created_by);

-- 13) task
create table if not exists task (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  title text not null,
  description text,
  status text not null default 'pending' check (status in ('pending','claimed','in-progress','blocked','done','cancelled')),
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  assigned_to text,
  related_entity_type text,
  related_entity_id text,
  output_artifact_id text,
  notes text,
  blocked_reason text,
  due_date date,
  tags text[] not null default '{}'
);
alter table task enable row level security;
create policy task_insert_own on task for insert with check ((auth.jwt() ->> 'email') = created_by);
create policy task_select_own on task for select using ((auth.jwt() ->> 'email') = created_by);
create policy task_update_own on task for update using ((auth.jwt() ->> 'email') = created_by);
create policy task_delete_own on task for delete using ((auth.jwt() ->> 'email') = created_by);

-- 14) thread
create table if not exists thread (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  title text not null,
  domain text not null check (domain in ('Logotic Hacking','Sonic Myth','Physical Basin Design','Heteronym Forge','Somatic River','Coherence Architecture','Myth Density Lab','Signal Threading','Open Arena')),
  body text not null,
  author_name text,
  author_type text not null default 'bio' check (author_type in ('bio','agent')),
  rosary_vow_accepted boolean not null default false,
  coherence numeric not null default 0,
  somatic_resonance numeric not null default 0,
  myth_density numeric not null default 0,
  status text not null default 'open' check (status in ('open','co-crafting','archived')),
  seeking text not null default 'any' check (seeking in ('bio','agent','any'))
);
alter table thread enable row level security;
create policy thread_insert_own on thread for insert with check ((auth.jwt() ->> 'email') = created_by);
create policy thread_select_admin_or_existing on thread for select using ((auth.jwt() ->> 'role') = 'admin' or created_by is not null);
create policy thread_update_admin_or_owner on thread for update using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() ->> 'email') = created_by);
create policy thread_delete_owner on thread for delete using ((auth.jwt() ->> 'email') = created_by);

-- 15) users (avoid reserved word "user")
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  email text unique,
  role text not null check (role in ('admin','user'))
);
alter table users enable row level security;
-- (no explicit policies defined in schema; keep locked down by default)

-- 16) workflow_definition
create table if not exists workflow_definition (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  name text not null,
  description text,
  trigger text not null default 'manual' check (trigger in ('manual','scheduled','on_event','on_demand')),
  schedule text,
  steps text,
  status text not null default 'draft' check (status in ('active','paused','draft','deprecated')),
  last_run_at timestamptz,
  last_run_status text,
  run_count numeric not null default 0,
  owner text
);
alter table workflow_definition enable row level security;
create policy workflow_definition_insert_own on workflow_definition for insert with check ((auth.jwt() ->> 'email') = created_by);
create policy workflow_definition_select_own on workflow_definition for select using ((auth.jwt() ->> 'email') = created_by);
create policy workflow_definition_update_own on workflow_definition for update using ((auth.jwt() ->> 'email') = created_by);
create policy workflow_definition_delete_own on workflow_definition for delete using ((auth.jwt() ->> 'email') = created_by);

-- 17) workflow_run
create table if not exists workflow_run (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  workflow_name text not null,
  started_at timestamptz,
  completed_at timestamptz,
  status text not null default 'running' check (status in ('running','completed','failed','cancelled')),
  summary text,
  artifact_ids text[] not null default '{}',
  task_ids text[] not null default '{}',
  error_log text,
  initiated_by text
);
alter table workflow_run enable row level security;
create policy workflow_run_insert_own on workflow_run for insert with check ((auth.jwt() ->> 'email') = created_by);
create policy workflow_run_select_admin on workflow_run for select using ((auth.jwt() ->> 'role') = 'admin');
create policy workflow_run_update_admin on workflow_run for update using ((auth.jwt() ->> 'role') = 'admin');
create policy workflow_run_delete_admin on workflow_run for delete using ((auth.jwt() ->> 'role') = 'admin');

