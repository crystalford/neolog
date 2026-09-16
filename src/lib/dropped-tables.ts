/**
 * The tables the extraction engine wrote into, dropped on 8 Sep 2026.
 *
 * One list, two readers, and they must not drift:
 *
 *   `POST /api/v2/admin/reset-to-recordings` drops them from a live D1.
 *   `src/lib/migration-runner.ts` uses it to recognise a migration that can
 *   never apply again.
 *
 * ── Why the migration runner needs this ──────────────────────────────────
 *
 * `MIGRATIONS` is append-only: an entry is never edited or removed, because
 * the name is the key in `schema_migrations` and renaming one re-runs SQL
 * that already applied. So the fifty-three migrations that built `threads`,
 * `clusters`, `productions` and the rest are still in the array, and on any
 * database where those tables are gone every one of them fails with
 * `no such table`.
 *
 * A failure is not recorded as applied — correctly, since a migration that
 * failed for a real reason must be retried. The result before this list
 * existed: **fifty-three statements failing on the first request of every
 * cold Worker isolate**, forever, and a health report that could never come
 * back clean.
 *
 * `no such table` is therefore NOT benign in general — that is how a table
 * that failed to create gets caught. It is benign only for a table on this
 * list, which is gone on purpose.
 *
 * ⚠️ **Adding a name here is not a way to silence a failing migration.** A
 * name belongs here only if the table was deliberately dropped and no code
 * path reads it. Do not re-add a dropped table; if one comes back, a
 * generator came back with it (CLAUDE.md).
 */
export const DROPPED_TABLES = [
  // The extraction passes and what fed on them
  'threads', 'creative_elements', 'clip_candidates', 'entities', 'entity_mentions',
  'thread_connections', 'extraction_runs', 'prompts',
  // Subjects
  'clusters', 'cluster_threads', 'cluster_insights', 'bounce_runs',
  'macro_clusters', 'macro_cluster_members', 'motifs', 'production_motifs',
  // Topics + research
  'topics', 'topic_sources',
  // The production engine
  'productions', 'production_beats', 'production_visual_assets',
  'projects', 'posts', 'surfaced_cards', 'broll_assets',
  // Chat, and voices for narration
  'chat_threads', 'chat_messages', 'chat_attachments',
  'voice_profiles', 'characters',
] as const

/**
 * Columns on tables that SURVIVED, holding output the deleted engine wrote.
 *
 * A dropped table announces itself — the query throws. These do not: the
 * column is still there, still typed, still full of a model's prose about
 * his life, and reading it renders perfectly. Both of these were written by
 * the extraction engine's last pass ("an AI-written title and summary
 * written back onto the recording"), nothing has written either since 8 Sep,
 * and on 9 Sep they were still the largest text on `/vlog/[id]`, the line
 * under a recording on the home feed, part of what `/footage` and `/vlogs`
 * searched, and a column in the footage CSV.
 *
 * The marking rule was satisfied throughout — the feed sets `author: 'log'`.
 * That is not the point. The engine went because he did not trust what it
 * wrote, and a sentence it wrote is still a sentence it wrote.
 *
 * The columns are not dropped: an ALTER cannot be undone, and the operator's
 * own act for clearing them is **Start again**, where `title` and `summary`
 * are both in `VLOG_DERIVED`. What is enforced is that nothing READS them.
 * `scripts/check-dropped-tables.mjs` fails CI on a select of one.
 */
export const MODEL_WRITTEN_COLUMNS = [
  'vlogs.title',
  'vlogs.summary',
  // A model's description of HIM, refreshed on a schedule — "exactly the
  // output he did not trust". Nothing reads these today, which is the state
  // to keep: `/facts` shows his one sentence or none, and will not draft one.
  'operator.profile_digest',
  'operator.spark_seeds_json',
] as const

const DROPPED = new Set<string>(DROPPED_TABLES)

/**
 * True when a D1 error is `no such table` naming a table this product
 * dropped on purpose — the one case where that error means "obsolete",
 * not "broken".
 */
export function isDroppedTableError(message: string): boolean {
  const m = /no such table:?\s*([A-Za-z_][A-Za-z0-9_]*)/i.exec(message)
  return m ? DROPPED.has(m[1]) : false
}
