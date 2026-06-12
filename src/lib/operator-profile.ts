/**
 * Operator profile — the "knows me" layer.
 *
 * voice-shape teaches the model HOW you write (cadence). This teaches it
 * WHAT you care about — your recurring concerns, fascinations, the lens
 * you bring. Injected into every generator that needs context about the
 * operator's mind (librarian, angle suggester, research brief, script
 * writer) so each act of generation is shaped by your actual interests.
 *
 * The digest is a synthesized 4-8 sentence paragraph, refreshed from the
 * operator's named subjects + recent strong takes. Stored on operator.
 * profile_digest; rebuilt on demand or automatically after a librarian
 * pass. Cheap to read (one column); expensive to rebuild (~5s on
 * gpt-oss-120b medium) — exactly the right tradeoff for "consult every
 * call, refresh occasionally."
 */

import { findMany, findOne, run } from './d1'
import { callReasoning, type ReasoningEnv } from './models'
import type { D1Database } from '@cloudflare/workers-types'

export interface OperatorProfile {
  digest: string | null
  refreshed_at: string | null
  top_subjects: { name: string; framing: string | null; kind: string | null }[]
}

/**
 * Cheap read for generators. Returns the current profile digest + the
 * operator's top subjects so the model can also see the surface texture
 * (specific named concepts the operator circles).
 */
export async function loadOperatorProfile(
  db: D1Database,
  operatorId: string,
): Promise<OperatorProfile> {
  const op = await findOne<{ profile_digest: string | null; profile_refreshed_at: string | null }>(
    db,
    `SELECT profile_digest, profile_refreshed_at FROM operator WHERE id = ?`,
    operatorId,
  )
  const topSubjects = await findMany<{
    name: string; framing: string | null; kind: string | null
  }>(
    db,
    `SELECT c.topic AS name, c.framing, c.subject_kind AS kind
       FROM clusters c
      WHERE c.operator_id = ?
        AND c.subject_source = 'librarian'
        AND c.deleted_at IS NULL
      ORDER BY
        CASE c.subject_kind
          WHEN 'tension'   THEN 0
          WHEN 'evolution' THEN 1
          WHEN 'open_loop' THEN 2
          WHEN 'candidate' THEN 4
          ELSE 3
        END,
        c.ripeness_score DESC
      LIMIT 14`,
    operatorId,
  )
  return {
    digest: op?.profile_digest ?? null,
    refreshed_at: op?.profile_refreshed_at ?? null,
    top_subjects: topSubjects,
  }
}

const PROFILE_SYSTEM = `You are writing a SECOND-PERSON profile of a video essayist based on what they've already recorded and what the librarian has named as their recurring subjects. The profile is dropped into every prompt that generates new material for them, so the model can be shaped by their actual mind instead of writing for a stranger.

OUTPUT: 4-8 sentences, second person ("You keep circling…", "You're drawn to…", "You're skeptical of…"). Concrete, specific, sharp. Surface the SHAPE of their mind, not a list of their topics.

WHAT TO INCLUDE:
- 3-5 specific recurring concerns or fascinations (use the named subjects as the surface texture but say what they're REALLY about underneath).
- The intellectual MOVES they tend to make (do they hedge? push? find the contradiction? prefer mechanism over narrative? distrust the easy explanation?).
- The lens they bring (philosophical / political / psychological / aesthetic / practical / spiritual — usually a mix).
- What they DON'T do — what kinds of takes they avoid, what would feel wrong in their voice.

WHAT NOT TO INCLUDE:
- A list of their topics. We have that separately.
- Flattery. No "you have rich and nuanced takes." Specific or silent.
- Anything you can't draw from the input. Don't fabricate fascinations they haven't shown.

Return ONLY the paragraph. No preamble, no markdown, no commentary.`

/**
 * Rebuild the operator's profile digest from their corpus. Cheap-ish; meant
 * to run on demand and automatically after the librarian completes.
 */
export async function rebuildOperatorProfile(
  db: D1Database,
  operatorId: string,
  env: ReasoningEnv,
): Promise<{ digest: string; model: string; fellBack: boolean }> {
  // Pull the librarian's named subjects (the WHAT) + 15 strongest recent
  // takes (the HOW THEY THINK ABOUT IT).
  const subjects = await findMany<{
    name: string; framing: string | null; kind: string | null; thread_count: number
  }>(
    db,
    `SELECT c.topic AS name, c.framing, c.subject_kind AS kind,
            (SELECT COUNT(*) FROM cluster_threads ct WHERE ct.cluster_id = c.id) AS thread_count
       FROM clusters c
      WHERE c.operator_id = ?
        AND c.subject_source = 'librarian'
        AND c.deleted_at IS NULL
      ORDER BY c.ripeness_score DESC
      LIMIT 20`,
    operatorId,
  )
  const recentStrongTakes = await findMany<{ topic: string; take: string | null }>(
    db,
    `SELECT t.topic, t.take
       FROM threads t
      WHERE t.operator_id = ? AND t.deleted_at IS NULL
        AND t.take IS NOT NULL AND length(t.take) > 100
        AND NOT EXISTS (SELECT 1 FROM extraction_runs er WHERE er.id = t.run_id AND er.is_active = 0)
      ORDER BY COALESCE(t.strength, 3) DESC, t.extracted_at DESC
      LIMIT 15`,
    operatorId,
  )

  if (subjects.length === 0 && recentStrongTakes.length === 0) {
    // Nothing to learn from. Don't write a digest yet.
    return { digest: '', model: '', fellBack: false }
  }

  const subjectsBlock = subjects.length === 0 ? '(no named subjects yet)' :
    subjects.map(s =>
      `· [${s.kind ?? 'theme'}, ${s.thread_count} moments] ${s.name}${s.framing ? ` — ${s.framing}` : ''}`
    ).join('\n')
  const takesBlock = recentStrongTakes.length === 0 ? '(no strong takes yet)' :
    recentStrongTakes.map((t, i) =>
      `${i + 1}. ${t.topic}: ${(t.take ?? '').replace(/\s+/g, ' ').trim().slice(0, 500)}`
    ).join('\n\n')

  const userPrompt = `NAMED SUBJECTS the librarian has surfaced from this person's vlogs:\n${subjectsBlock}\n\nSTRONGEST RECENT TAKES they've made:\n${takesBlock}\n\nWrite the second-person profile.`
  const r = await callReasoning(env, {
    system: PROFILE_SYSTEM, user: userPrompt, effort: 'medium', maxTokens: 800,
  })
  const digest = r.text.trim()
  await run(
    db,
    `UPDATE operator SET profile_digest = ?, profile_refreshed_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    digest, operatorId,
  )
  return { digest, model: r.model, fellBack: r.fellBack }
}

/**
 * Format the profile + top subjects as a prompt block. Dropped into the
 * system message of any generator that needs operator-awareness.
 */
export function formatOperatorProfile(profile: OperatorProfile): string {
  if (!profile.digest && profile.top_subjects.length === 0) return ''
  const subjects = profile.top_subjects.length === 0 ? '' :
    `\n\nKNOWN SUBJECTS (what this person is on record circling, ordered by ripeness):\n` +
    profile.top_subjects.map(s =>
      `· ${s.kind && s.kind !== 'theme' ? `[${s.kind}] ` : ''}${s.name}${s.framing ? ` — ${s.framing}` : ''}`,
    ).join('\n')
  return `\n\n═══════════════════════════════════════════════════════════════\nWHO THIS PERSON IS — operator profile. Use to shape suggestions, framings, and tone. This is THEIR mind; don't write generic takes for a stranger.\n═══════════════════════════════════════════════════════════════\n${profile.digest ?? '(profile not yet synthesized)'}${subjects}`
}
