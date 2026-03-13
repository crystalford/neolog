-- Tracks the state of AI model training jobs per user
-- One row per user — updated as training progresses
create table if not exists manifest_training_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Voice clone (ElevenLabs PVC)
  voice_clone_triggered_at timestamptz,
  voice_clone_model_id text,
  voice_clone_status text check (voice_clone_status in ('queued', 'training', 'ready', 'failed')),

  -- Visual LoRA (fal.ai FLUX LoRA)
  lora_triggered_at timestamptz,
  lora_model_id text,
  lora_status text check (lora_status in ('queued', 'training', 'ready', 'failed')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(user_id)
);

create index if not exists idx_manifest_training_state_user on manifest_training_state(user_id);

alter table manifest_training_state enable row level security;

create policy "Users can view own training state"
  on manifest_training_state for select
  using (auth.uid() = user_id);

create policy "Service role full access to manifest training state"
  on manifest_training_state for all
  using (auth.role() = 'service_role');
