/**
 * Spark-time concept suggestions. The cousin of suggestTopicAngles, but
 * for the Spark composer — produces 5-8 SHARP CONCEPT SEEDS (each 4-9
 * words) drawn from the operator's profile + recent subjects.
 *
 * The Spark surface goes from "blank input page" to "five tempting
 * concepts to bang out right now." Even before the operator types
 * anything, the page suggests directions they could take.
 *
 * Cached on operator.spark_seeds_json so the composer renders them
 * instantly; refreshed when the librarian completes (same trigger that
 * refreshes the profile digest).
 */

import { callReasoning, type ReasoningEnv } from './models'
import { findMany, findOne, run } from './d1'
import type { D1Database } from '@cloudflare/workers-types'

const SPARK_SEEDS_SYSTEM = `You are pitching SHORT-FORM VIDEO CONCEPTS to a video essayist. Each concept is a 30-60 second short they could bang out RIGHT NOW. The operator wants quick, learnable, postable.

You receive the operator's profile (what they care about and how they think) plus their recently-circled subjects. Propose 5-8 concepts that:

· Are SHARP — a single specific claim, mechanism, contradiction, or pattern. Not "Talk about X" — "X is a {specific thing}." A sentence the short could open with.
· Are LEARNABLE — making the short would teach the operator something or solidify a thought. The "learn by creating" loop.
· Are TIGHT — each concept must fit a 30-60 second short. If it needs 10 minutes of setup, it's wrong here.
· Connect to their MIND. At least 3-4 of the concepts must trace back to subjects they already circle. Use the profile + named subjects as the surface texture.
· Are VARIED. Don't propose five variations on the same idea. Different territories, different shapes.

EACH CONCEPT has two parts:
  · seed: a 4-9 word HOOK — the thing the short would actually be about. Phrasing matters. Examples:
      - "Procrastination is information, not a flaw."
      - "The principal-agent problem at home."
      - "Why the felt sense decides before the head."
      - "The contradiction in your routines."
  · spark_why: ONE sentence telling the operator why this concept is good for them specifically. ("Connects to your circling of {X}." "Resolves a tension you flagged in {Y}.") Concrete. Not flattery.

DO NOT:
· Propose generic life-coach concepts ("the power of habits", "embrace the journey").
· Repeat language from the operator's existing subject names — surface NEW angles, not the same labels.
· Moralize. No "the importance of X."

Return ONLY this JSON:
{"seeds":[{"seed":"...","spark_why":"..."}]}`

export interface SparkSeed {
  seed: string
  spark_why: string
}

export async function buildSparkSeeds(
  db: D1Database,
  operatorId: string,
  env: ReasoningEnv,
): Promise<{ seeds: SparkSeed[]; model: string; fellBack: boolean }> {
  // Load the profile + top subjects, same shape as operator-profile uses.
  const op = await findOne<{ profile_digest: string | null }>(
    db, `SELECT profile_digest FROM operator WHERE id = ?`, operatorId,
  )
  const subjects = await findMany<{ name: string; framing: string | null; kind: string | null }>(
    db,
    `SELECT c.topic AS name, c.framing, c.subject_kind AS kind
       FROM clusters c
      WHERE c.operator_id = ? AND c.subject_source = 'librarian' AND c.deleted_at IS NULL
      ORDER BY c.ripeness_score DESC LIMIT 16`,
    operatorId,
  )
  if (!op?.profile_digest && subjects.length === 0) {
    return { seeds: [], model: '', fellBack: false }
  }

  const subjBlock = subjects.length === 0 ? '(none yet)' :
    subjects.map(s =>
      `· [${s.kind ?? 'theme'}] ${s.name}${s.framing ? ` — ${s.framing}` : ''}`
    ).join('\n')

  const userPrompt = `OPERATOR PROFILE:\n${op?.profile_digest ?? '(not synthesized yet — base seeds on the subjects alone)'}\n\nNAMED SUBJECTS they already circle:\n${subjBlock}\n\nPropose 5-8 SHORT concept seeds.`

  const r = await callReasoning(env, {
    system: SPARK_SEEDS_SYSTEM, user: userPrompt, effort: 'medium', maxTokens: 1500,
  })
  const seeds = parseSparkSeeds(r.text)
  // Cache on operator row.
  await run(
    db,
    `UPDATE operator SET spark_seeds_json = ?, spark_seeds_refreshed_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    JSON.stringify(seeds), operatorId,
  )
  return { seeds, model: r.model, fellBack: r.fellBack }
}

export async function loadSparkSeeds(
  db: D1Database, operatorId: string,
): Promise<{ seeds: SparkSeed[]; refreshed_at: string | null }> {
  const op = await findOne<{ spark_seeds_json: string | null; spark_seeds_refreshed_at: string | null }>(
    db, `SELECT spark_seeds_json, spark_seeds_refreshed_at FROM operator WHERE id = ?`, operatorId,
  )
  let seeds: SparkSeed[] = []
  if (op?.spark_seeds_json) {
    try { seeds = JSON.parse(op.spark_seeds_json) } catch {}
  }
  return { seeds, refreshed_at: op?.spark_seeds_refreshed_at ?? null }
}

function parseSparkSeeds(text: string): SparkSeed[] {
  let t = text.trim()
  if (t.startsWith('```json')) t = t.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim()
  else if (t.startsWith('```')) t = t.replace(/^```\s*/, '').replace(/```\s*$/, '').trim()
  const fb = t.indexOf('{'), lb = t.lastIndexOf('}')
  if (fb > 0 && lb > fb) t = t.slice(fb, lb + 1)
  const obj = JSON.parse(t)
  const arr = Array.isArray(obj?.seeds) ? obj.seeds : []
  return arr
    .filter((s: any) => s && typeof s.seed === 'string')
    .map((s: any) => ({
      seed: String(s.seed).trim().slice(0, 140),
      spark_why: String(s.spark_why ?? '').trim().slice(0, 240),
    }))
    .slice(0, 10)
}
