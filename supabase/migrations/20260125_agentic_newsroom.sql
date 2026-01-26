-- Agentic Newsroom Feature
-- Enables users to create AI agents that research and write blog posts using BYOK (Bring Your Own Key)

-- ==============================================
-- Table: user_api_keys
-- Store encrypted API keys for AI and search providers
-- ==============================================
create table if not exists public.user_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  provider text not null check (provider in ('openai', 'anthropic', 'tavily', 'serpapi')),
  encrypted_key text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  -- One key per provider per user
  unique(user_id, provider)
);

create index if not exists idx_user_api_keys_user_id on public.user_api_keys(user_id);

-- Enable RLS
alter table public.user_api_keys enable row level security;

-- Users can only see and manage their own keys
create policy "Users can view their own API keys"
  on public.user_api_keys for select
  using (auth.uid() = user_id);

create policy "Users can insert their own API keys"
  on public.user_api_keys for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own API keys"
  on public.user_api_keys for update
  using (auth.uid() = user_id);

create policy "Users can delete their own API keys"
  on public.user_api_keys for delete
  using (auth.uid() = user_id);

-- ==============================================
-- Table: agents
-- Agent configurations (the "newsroom personas")
-- ==============================================
create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  publication_id uuid references public.publications(id) on delete cascade,
  
  -- Agent identity
  name text not null,
  description text,
  
  -- Agent behavior
  system_prompt text not null, -- The style/vibe instructions
  search_query text not null, -- What to search for
  
  -- Model configuration
  model_provider text not null check (model_provider in ('openai', 'anthropic')),
  model_name text not null, -- e.g., 'gpt-4o', 'claude-3-5-sonnet-20241022'
  
  -- Settings
  is_active boolean default true,
  
  -- Metadata
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_run_at timestamptz
);

create index if not exists idx_agents_user_id on public.agents(user_id);
create index if not exists idx_agents_publication_id on public.agents(publication_id);

-- Enable RLS
alter table public.agents enable row level security;

-- Users can only see and manage their own agents
create policy "Users can view their own agents"
  on public.agents for select
  using (auth.uid() = user_id);

create policy "Users can insert their own agents"
  on public.agents for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own agents"
  on public.agents for update
  using (auth.uid() = user_id);

create policy "Users can delete their own agents"
  on public.agents for delete
  using (auth.uid() = user_id);

-- ==============================================
-- Table: agent_runs
-- Execution history for agents
-- ==============================================
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.agents(id) on delete cascade not null,
  
  -- Execution status
  status text not null check (status in ('running', 'completed', 'failed')),
  
  -- Results
  post_id uuid references public.posts(id) on delete set null,
  error_message text,
  
  -- Metrics
  search_results_count integer,
  tokens_used integer,
  
  -- Timing
  started_at timestamptz default now(),
  completed_at timestamptz
);

create index if not exists idx_agent_runs_agent_id on public.agent_runs(agent_id);
create index if not exists idx_agent_runs_post_id on public.agent_runs(post_id);
create index if not exists idx_agent_runs_started_at on public.agent_runs(started_at desc);

-- Enable RLS
alter table public.agent_runs enable row level security;

-- Users can view runs for their own agents
create policy "Users can view their own agent runs"
  on public.agent_runs for select
  using (
    exists (
      select 1 from public.agents
      where agents.id = agent_runs.agent_id
      and agents.user_id = auth.uid()
    )
  );

-- System can insert/update runs (via service role)
create policy "Service role can manage agent runs"
  on public.agent_runs for all
  using (true)
  with check (true);

-- ==============================================
-- Triggers
-- ==============================================

-- Auto-update updated_at on user_api_keys
create trigger user_api_keys_updated_at
  before update on public.user_api_keys
  for each row
  execute function public.handle_updated_at();

-- Auto-update updated_at on agents
create trigger agents_updated_at
  before update on public.agents
  for each row
  execute function public.handle_updated_at();

-- Update agent's last_run_at when a run completes
create or replace function public.update_agent_last_run()
returns trigger as $$
begin
  if new.status = 'completed' and old.status = 'running' then
    update public.agents
    set last_run_at = new.completed_at
    where id = new.agent_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger agent_runs_update_last_run
  after update on public.agent_runs
  for each row
  execute function public.update_agent_last_run();

-- ==============================================
-- Comments for documentation
-- ==============================================
comment on table public.user_api_keys is 'Encrypted API keys for AI and search providers (BYOK model)';
comment on table public.agents is 'AI agent configurations for automated content research and writing';
comment on table public.agent_runs is 'Execution history and metrics for agent runs';
