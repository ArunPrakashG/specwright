export const schemaSql = `
-- Specwright dashboard schema. Idempotent; run on every start.
-- The spec itself lives on disk (one folder, and ideally one git repo, per project).
-- The database indexes projects and holds builds, review versions and comments.

create extension if not exists pgcrypto;

create table if not exists workspace (
  id int primary key default 1 check (id = 1),
  name text not null default 'My studio',
  updated_at timestamptz not null default now()
);
insert into workspace (id) values (1) on conflict do nothing;

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  domain text,
  platform text not null default 'woocommerce',
  stage text not null default 'draft' check (stage in ('draft', 'building', 'in-review', 'approved', 'live')),
  revision int not null default 1,
  review_token text not null default encode(gen_random_bytes(18), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists spec_versions (
  project_id uuid not null references projects(id) on delete cascade,
  revision int not null,
  spec jsonb not null,
  created_at timestamptz not null default now(),
  primary key (project_id, revision)
);

create table if not exists builds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  number int not null,
  target text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'pass', 'fail', 'cancelled')),
  revision int not null,
  steps jsonb not null default '[]',
  checks jsonb not null default '[]',
  fixes jsonb not null default '[]',
  preview_url text,
  log text not null default '',
  cancel_requested boolean not null default false,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique (project_id, number)
);

-- A version shared with the client for review: v1, v2, v3 of one page set.
create table if not exists review_versions (
  project_id uuid not null references projects(id) on delete cascade,
  n int not null,
  revision int not null,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by text,
  primary key (project_id, n)
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  -- Thread number shown on the pin; null for replies.
  n int,
  parent_id uuid references comments(id) on delete cascade,
  version int not null,
  page_id text not null,
  spec_id text not null,
  viewport text not null default 'desktop' check (viewport in ('desktop', 'mobile')),
  body text not null check (length(body) between 1 and 4000),
  author_name text not null,
  author_role text not null check (author_role in ('client', 'agency')),
  label text check (label in ('copy', 'design', 'bug', 'scope')),
  status text not null default 'open' check (status in ('open', 'quote-sent', 'resolved')),
  resolved_in int,
  created_at timestamptz not null default now()
);
create index if not exists comments_project on comments (project_id, created_at);
create unique index if not exists comments_thread_n on comments (project_id, n) where n is not null;
`;
