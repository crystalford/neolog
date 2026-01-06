-- Canonical Terms (Lexicon)

create table if not exists public.canonical_terms (
  id uuid default uuid_generate_v4() primary key,
  owner_id uuid references public.profiles(id) on delete cascade not null,
  publication_id uuid references public.publications(id) on delete set null,

  name text not null,
  slug text not null,
  definition_md text not null default '',

  status text not null default 'draft' check (status in ('draft', 'canonical', 'deprecated')),
  locked boolean not null default false,
  current_version integer not null default 1,

  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,

  constraint canonical_terms_unique_slug unique (owner_id, publication_id, slug)
);

create index if not exists canonical_terms_owner_idx on public.canonical_terms(owner_id);
create index if not exists canonical_terms_publication_idx on public.canonical_terms(publication_id);
create index if not exists canonical_terms_slug_idx on public.canonical_terms(slug);

create table if not exists public.canonical_term_versions (
  id uuid default uuid_generate_v4() primary key,
  term_id uuid references public.canonical_terms(id) on delete cascade not null,
  version_number integer not null,
  definition_md text not null,
  change_summary text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,

  constraint canonical_term_versions_unique unique (term_id, version_number)
);

create index if not exists canonical_term_versions_term_idx on public.canonical_term_versions(term_id);

-- RLS
alter table public.canonical_terms enable row level security;
alter table public.canonical_term_versions enable row level security;

create policy if not exists "Owners manage canonical terms"
  on public.canonical_terms for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy if not exists "Owners manage canonical term versions"
  on public.canonical_term_versions for all
  using (
    exists (
      select 1 from public.canonical_terms t
      where t.id = term_id and t.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.canonical_terms t
      where t.id = term_id and t.owner_id = auth.uid()
    )
  );
