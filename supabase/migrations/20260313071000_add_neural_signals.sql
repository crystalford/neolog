-- Create neural_signals table for AI Character Training
create table if not exists public.neural_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  signal_type text not null check (signal_type in ('voice', 'image')),
  url text not null,
  quality_score float default 0.0,
  is_training_ready boolean default false,
  metadata jsonb default '{}'::jsonb,
  source_log_id uuid references public.log_entries(id) on delete set null,
  source_upload_id uuid references public.video_uploads(id) on delete set null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- RLS
alter table public.neural_signals enable row level security;

create policy "Users can view their own neural signals"
  on public.neural_signals for select
  using (auth.uid() = user_id);

create policy "Users can insert their own neural signals"
  on public.neural_signals for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own neural signals"
  on public.neural_signals for update
  using (auth.uid() = user_id);

create policy "Users can delete their own neural signals"
  on public.neural_signals for delete
  using (auth.uid() = user_id);

-- Storage bucket for neural assets
insert into storage.buckets (id, name, public)
values ('neural-signals', 'neural-signals', true)
on conflict (id) do nothing;

-- Storage policies
create policy "Neural signals are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'neural-signals');

create policy "Users can upload neural signals"
  on storage.objects for insert
  with check (bucket_id = 'neural-signals' AND auth.uid()::text = (storage.foldername(name))[1]);
