/**
 * Inngest function: synthesize-user-graph
 *
 * Cross-corpus synthesis across ALL of a user's processed uploads.
 * Finds dominant narrative arcs, contradictions, commitment follow-through,
 * momentum signals, and distills a single "spine" — the through-line of
 * the user's current chapter.
 *
 * Unlike synthesize-session (which analyzes clips within one manual session),
 * this function looks at the entire accumulated corpus over time.
 *
 * Triggered by:
 *   - POST /api/synthesize-graph (manual trigger from dashboard)
 *   - neolog/upload.processed after every 10th processed upload
 */

import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

type SynthesizeGraphEvent = {
  name: 'neolog/synthesize-graph'
  data: {
    user_id: string
  }
}

export const synthesizeUserGraph = inngest.createFunction(
  {
    id: 'synthesize-user-graph',
    name: 'Synthesize User Knowledge Graph',
    retries: 1,
    timeouts: {
      finish: '10m',
    },
  },
  { event: 'neolog/synthesize-graph' },
  async ({ event, step }) => {
    const { user_id } = event.data

    const admin = createAdminClient()
    if (!admin) throw new Error('Admin client not available')

    // ── Step 1: Gather the corpus ──
    const corpus = await step.run('gather-corpus', async () => {
      const [
        { data: uploads },
        { data: entities },
        { data: openMentions },
      ] = await Promise.all([
        // All processed uploads — get the already-extracted intelligence, not full transcripts
        admin
          .from('video_uploads')
          .select('id, file_name, created_at, duration_seconds, analysis, tags')
          .eq('user_id', user_id)
          .eq('status', 'processed')
          .order('created_at', { ascending: true }),

        // Full entity graph — this is the skeleton of the user's mind
        admin
          .from('entities')
          .select('id, type, name, status, summary, mention_count, first_mentioned_at, last_mentioned_at')
          .eq('user_id', user_id)
          .order('mention_count', { ascending: false })
          .limit(100),

        // Recent entity mentions with framing context (last 200)
        admin
          .from('entity_mentions')
          .select('entity_id, context, sentiment, created_at, video_upload_id')
          .in('entity_id',
            // We need to do a subquery — fetch entity IDs for this user first
            (await admin.from('entities').select('id').eq('user_id', user_id)).data?.map(e => e.id) ?? []
          )
          .order('created_at', { ascending: false })
          .limit(200),
      ])

      const openaiKey = await resolveProviderKeyWithClient(admin, user_id, 'openai')
      const anthropicKey = await resolveProviderKeyWithClient(admin, user_id, 'anthropic')

      if (!openaiKey && !anthropicKey) {
        throw new Error('No AI API key configured — add one in Settings')
      }

      return {
        uploads: uploads ?? [],
        entities: entities ?? [],
        openMentions: openMentions ?? [],
        openaiKey: openaiKey?.key ?? null,
        anthropicKey: anthropicKey?.key ?? null,
      }
    })

    // ── Step 2: Build structured corpus representation + call AI ──
    const result = await step.run('synthesize', async () => {
      const { uploads, entities, openMentions, openaiKey, anthropicKey } = corpus

      if (uploads.length < 3) {
        throw new Error('Need at least 3 processed uploads to synthesize')
      }

      const dateStart = uploads[0]?.created_at
      const dateEnd = uploads[uploads.length - 1]?.created_at

      // Build upload summaries — analysis JSON is already extracted, no full transcripts needed
      const uploadLines = uploads.map((u) => {
        const a = (u.analysis as any) ?? {}
        const date = new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        const parts: string[] = [`[${date}] ${u.file_name}`]
        if (a.summary) parts.push(`  Summary: ${a.summary}`)
        if (a.mood) parts.push(`  Mood: ${a.mood}${a.energy_level ? ` | Energy: ${a.energy_level}` : ''}`)
        if (a.projects?.length) parts.push(`  Projects mentioned: ${a.projects.join(', ')}`)
        if (a.themes?.length) parts.push(`  Themes: ${a.themes.join(', ')}`)
        if (a.commitments?.length) parts.push(`  Commitments made: ${a.commitments.join('; ')}`)
        if (a.blockers?.length) parts.push(`  Blockers: ${a.blockers.join('; ')}`)
        return parts.join('\n')
      }).join('\n\n')

      // Entity graph — group by type, list with mention counts
      const entityByType: Record<string, typeof entities> = {}
      for (const e of entities) {
        if (!entityByType[e.type]) entityByType[e.type] = []
        entityByType[e.type].push(e)
      }
      const entityLines = Object.entries(entityByType).map(([type, list]) => {
        const items = list.map(e =>
          `  - ${e.name} (${e.mention_count}x mentions${e.status && e.status !== 'active' ? `, ${e.status}` : ''}${e.summary ? `: ${e.summary}` : ''})`
        ).join('\n')
        return `${type.toUpperCase()}:\n${items}`
      }).join('\n\n')

      // Sample recent mention contexts for framing
      const mentionLines = openMentions
        .slice(0, 80)
        .map(m => {
          const entity = entities.find(e => e.id === m.entity_id)
          if (!entity) return null
          const date = new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          return `[${date}] ${entity.name}: "${m.context}"${m.sentiment && m.sentiment !== 'neutral' ? ` (${m.sentiment})` : ''}`
        })
        .filter(Boolean)
        .join('\n')

      const systemPrompt = `You are an intelligence analyst for a single person's entire recorded thought output. You read across all their raw brain-dump videos and find the actual narratives, tensions, and momentum — not just themes, but story arcs with beginning, middle, and unresolved tension.

You are analytical, not motivational. You don't tell the user what they want to hear. You find what's actually happening in the pattern of their words.

Return only valid JSON. No markdown, no explanation outside the JSON object.`

      const userPrompt = `Analyze this person's complete video corpus and return a JSON synthesis.

DATE RANGE: ${dateStart ? new Date(dateStart).toLocaleDateString() : 'unknown'} → ${dateEnd ? new Date(dateEnd).toLocaleDateString() : 'unknown'}
UPLOAD COUNT: ${uploads.length}

--- UPLOADS (chronological) ---
${uploadLines}

--- ENTITY GRAPH ---
${entityLines}

--- RECENT FRAMING CONTEXTS ---
${mentionLines}

Return this exact JSON structure:
{
  "spine": "One sentence capturing the person's current chapter — not a mission statement, not motivational. A diagnosis of where they actually are right now.",
  "narratives": [
    {
      "title": "Short arc title",
      "description": "2-3 sentences describing this narrative arc — what's the setup, the tension, and what's unresolved",
      "arc_type": "progress|struggle|exploration|transformation",
      "strength": 8
    }
  ],
  "themes": [
    {
      "theme": "Theme name",
      "strength": 7,
      "upload_count": 4
    }
  ],
  "contradictions": [
    {
      "topic": "What they're contradicting themselves on",
      "position_a": "Earlier stated position",
      "position_b": "Later stated position that conflicts"
    }
  ],
  "commitments_open": [
    {
      "commitment": "Specific commitment they made",
      "context": "Brief context of when/why"
    }
  ],
  "momentum": {
    "accelerating": ["Project or idea gaining energy and forward motion"],
    "stalling": ["Project or idea that's losing momentum or getting stuck"],
    "dormant": ["Things mentioned but completely silent recently"]
  }
}

Rules:
- narratives: 3-5 arcs. These are STORY ARCS with tension, not just topic clusters.
- themes: 4-8 recurring themes across the corpus
- contradictions: Only include real contradictions — stated positions that actually conflict. Ignore trivial inconsistencies.
- commitments_open: Only commitments that haven't been marked resolved and show no evidence of follow-through in later uploads
- momentum.accelerating: 2-4 items max
- momentum.stalling: 2-4 items max
- momentum.dormant: 2-4 items max
- spine: Make this specific and honest. If they're scattered and procrastinating, say that. If they're in a breakthrough period, say that.`

      let responseText: string

      if (anthropicKey) {
        const anthropic = new Anthropic({ apiKey: anthropicKey })
        const response = await anthropic.messages.create({
          model: 'claude-opus-4-5',
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        })
        responseText = response.content[0].type === 'text' ? response.content[0].text : ''
      } else {
        const openai = new OpenAI({ apiKey: openaiKey! })
        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          max_tokens: 4096,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
        })
        responseText = response.choices[0].message.content || ''
      }

      let parsed: any
      try {
        const clean = responseText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
        parsed = JSON.parse(clean)
      } catch (e) {
        throw new Error(`Failed to parse synthesis response: ${e}`)
      }

      return {
        parsed,
        uploadCount: uploads.length,
        dateStart,
        dateEnd,
        model: anthropicKey ? 'claude-opus-4-5' : 'gpt-4o',
      }
    })

    // ── Step 3: Store the synthesis ──
    await step.run('store-synthesis', async () => {
      const { parsed, uploadCount, dateStart, dateEnd, model } = result

      await admin.from('user_synthesis').insert({
        user_id,
        synthesized_at: new Date().toISOString(),
        upload_count: uploadCount,
        date_range_start: dateStart,
        date_range_end: dateEnd,
        spine: parsed.spine ?? null,
        narratives: parsed.narratives ?? null,
        themes: parsed.themes ?? null,
        contradictions: parsed.contradictions ?? null,
        commitments_open: parsed.commitments_open ?? null,
        momentum: parsed.momentum ?? null,
        synthesis_model: model,
      })
    })

    // ── Step 4: Notify downstream (optional: future notification hooks) ──
    await step.sendEvent('synthesis-complete', {
      name: 'neolog/synthesis.complete',
      data: { user_id },
    })

    return {
      status: 'complete',
      upload_count: result.uploadCount,
      model: result.model,
    }
  },
)
