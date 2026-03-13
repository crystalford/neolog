-- Neural Corpus: High-fidelity signals for AI Twin training
create table if not exists neural_corpus (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_upload_id uuid references video_uploads(id) on delete set null,

  -- Signal Type: 'voice' | 'face' | 'logic'
  type text not null check (type in ('voice', 'face', 'logic')),
  
  -- Signal Storage
  storage_path text not null,
  storage_provider text not null default 'supabase',
  
  -- Fidelity Metrics
  fidelity_score numeric default 0, -- 0 to 1 automated quality score
  fidelity_rank text,              -- 'S' | 'A' | 'B' | 'C'
  
  -- Metadata
  meta jsonb default '{}',          -- duration, resolution, clarity, emotions detected, etc.
  
  -- Lifecycle
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indices
create index if not exists idx_neural_corpus_user_id on neural_corpus(user_id);
create index if not exists idx_neural_corpus_type on neural_corpus(user_id, type);
create index if not exists idx_neural_corpus_fidelity on neural_corpus(fidelity_score desc);

-- RLS
alter table neural_corpus enable row level security;

create policy "Users can view own neural corpus"
  on neural_corpus for select
  using (auth.uid() = user_id);

create policy "Users can insert own neural corpus"
  on neural_corpus for insert
  with check (auth.uid() = user_id);

create policy "Users can update own neural corpus"
  on neural_corpus for update
  using (auth.uid() = user_id);

create policy "Users can delete own neural corpus"
  on neural_corpus for delete
  using (auth.uid() = user_id);

create policy "Service role full access to neural corpus"
  on neural_corpus for all
  using (auth.role() = 'service_role');
