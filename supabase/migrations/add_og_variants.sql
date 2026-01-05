-- Programmatic visuals engine: add additional OG variants to distribution packs

alter table public.post_distribution_packs
  add column if not exists og_square_url text,
  add column if not exists og_story_url text;
