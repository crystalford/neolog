-- Cross-corpus synthesis: meta-analysis across ALL of a user's uploads
-- Finds narratives, contradictions, commitments, momentum, and a through-line "spine"
create table if not exists user_synthesis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  synthesized_at timestamptz not null default now(),
  upload_count int,
  date_range_start timestamptz,
  date_range_end timestamptz,

  -- The through-line: one sentence capturing the user's current chapter
  spine text,

  -- Dominant narrative arcs running through the corpus
  -- [{title, description, upload_ids, arc_type, strength}]
  narratives jsonb,

  -- Recurring themes with temporal tracking
  -- [{theme, strength, first_seen, last_seen, upload_count}]
  themes jsonb,

  -- Positions that contradict each other across time
  -- [{topic, position_a, position_b, upload_ids, dates}]
  contradictions jsonb,

  -- Commitments made but not yet resolved
  -- [{commitment, date, context}]
  commitments_open jsonb,

  -- Which projects/ideas are accelerating vs stalling vs dormant
  -- {accelerating: string[], stalling: string[], dormant: string[]}
  momentum jsonb,

  -- Model used for synthesis
  synthesis_model text
);

create index if not exists idx_user_synthesis_user_id on user_synthesis(user_id);
create index if not exists idx_user_synthesis_synthesized_at on user_synthesis(user_id, synthesized_at desc);

alter table user_synthesis enable row level security;

create policy "Users can view own synthesis"
  on user_synthesis for select
  using (auth.uid() = user_id);

create policy "Service role full access to user synthesis"
  on user_synthesis for all
  using (auth.role() = 'service_role');
