-- Neolog standard owner-policy template
--
-- Apply this template verbatim to every new user-data table added in the
-- filament-update rewrite. One pattern, zero variation.
--
-- IMPORTANT: After Phase 2, new tables use `operator_id` as the owner column.
-- Tables that still use `user_id` (legacy schema) follow the same pattern with
-- `user_id` substituted — see VARIANT 2 below.
--
-- For tables where ownership is INDIRECT (e.g. `cluster_threads` ownership
-- comes through `clusters.operator_id`), use VARIANT 3 (indirect via parent).

-- =============================================================================
-- VARIANT 1 — Direct ownership via operator_id (NEW tables, post-rewrite)
-- =============================================================================
-- Replace {{TABLE}} with the table name. Apply all six statements.

alter table {{TABLE}} enable row level security;

create policy "Operators can view own {{TABLE}}"
  on {{TABLE}} for select
  using (auth.uid() = operator_id);

create policy "Operators can insert own {{TABLE}}"
  on {{TABLE}} for insert
  with check (auth.uid() = operator_id);

create policy "Operators can update own {{TABLE}}"
  on {{TABLE}} for update
  using (auth.uid() = operator_id);

create policy "Operators can delete own {{TABLE}}"
  on {{TABLE}} for delete
  using (auth.uid() = operator_id);

create policy "Service role full access to {{TABLE}}"
  on {{TABLE}} for all
  using (auth.role() = 'service_role');


-- =============================================================================
-- VARIANT 2 — Direct ownership via user_id (LEGACY tables kept post-rewrite)
-- =============================================================================
-- Same shape, `user_id` instead of `operator_id`.

-- alter table {{TABLE}} enable row level security;
--
-- create policy "Users can view own {{TABLE}}"
--   on {{TABLE}} for select
--   using (auth.uid() = user_id);
--
-- create policy "Users can insert own {{TABLE}}"
--   on {{TABLE}} for insert
--   with check (auth.uid() = user_id);
--
-- create policy "Users can update own {{TABLE}}"
--   on {{TABLE}} for update
--   using (auth.uid() = user_id);
--
-- create policy "Users can delete own {{TABLE}}"
--   on {{TABLE}} for delete
--   using (auth.uid() = user_id);
--
-- create policy "Service role full access to {{TABLE}}"
--   on {{TABLE}} for all
--   using (auth.role() = 'service_role');


-- =============================================================================
-- VARIANT 3 — Indirect ownership via parent table
-- =============================================================================
-- For join/membership tables (e.g. `cluster_threads`, `production_beats`).
-- Replace {{TABLE}}, {{PARENT}}, {{PARENT_FK}} (the column on {{TABLE}} that
-- references {{PARENT}}.id).

-- alter table {{TABLE}} enable row level security;
--
-- create policy "Operators can view own {{TABLE}}"
--   on {{TABLE}} for select
--   using (exists (
--     select 1 from {{PARENT}}
--     where {{PARENT}}.id = {{TABLE}}.{{PARENT_FK}}
--       and {{PARENT}}.operator_id = auth.uid()
--   ));
--
-- create policy "Operators can insert own {{TABLE}}"
--   on {{TABLE}} for insert
--   with check (exists (
--     select 1 from {{PARENT}}
--     where {{PARENT}}.id = {{TABLE}}.{{PARENT_FK}}
--       and {{PARENT}}.operator_id = auth.uid()
--   ));
--
-- create policy "Operators can update own {{TABLE}}"
--   on {{TABLE}} for update
--   using (exists (
--     select 1 from {{PARENT}}
--     where {{PARENT}}.id = {{TABLE}}.{{PARENT_FK}}
--       and {{PARENT}}.operator_id = auth.uid()
--   ));
--
-- create policy "Operators can delete own {{TABLE}}"
--   on {{TABLE}} for delete
--   using (exists (
--     select 1 from {{PARENT}}
--     where {{PARENT}}.id = {{TABLE}}.{{PARENT_FK}}
--       and {{PARENT}}.operator_id = auth.uid()
--   ));
--
-- create policy "Service role full access to {{TABLE}}"
--   on {{TABLE}} for all
--   using (auth.role() = 'service_role');


-- =============================================================================
-- VARIANT 4 — Public-readable rows (for `productions_v2`, `posts_v2`, `clip_candidates`
-- where visibility = 'public', and `profiles` for limited public fields)
-- =============================================================================
-- Layered on top of VARIANT 1: anyone can SELECT rows where visibility='public'.

-- create policy "Anyone can view public {{TABLE}}"
--   on {{TABLE}} for select
--   using (visibility = 'public');


-- =============================================================================
-- USAGE
-- =============================================================================
-- 1. In each new table's migration file, after the CREATE TABLE statement,
--    paste the VARIANT 1 block (or other relevant variant) and replace
--    {{TABLE}} with the table name.
-- 2. Do NOT modify the policy text or names beyond the table substitution.
--    Consistency makes the smoke test reliable.
-- 3. After running the migration, run `pnpm tsx scripts/smoke-rls.ts` against
--    the new table to confirm zero leakage between two test users.
