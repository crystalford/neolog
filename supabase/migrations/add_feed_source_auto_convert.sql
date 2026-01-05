-- Feed sources: optional destination publication + auto-convert to drafts

alter table public.feed_sources
  add column if not exists publication_id uuid references public.publications(id) on delete set null;

alter table public.feed_sources
  add column if not exists auto_convert_to_drafts boolean default false;

create index if not exists feed_sources_publication_idx on public.feed_sources(publication_id);
