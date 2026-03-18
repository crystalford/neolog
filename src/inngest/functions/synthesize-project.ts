/**
 * Inngest function: synthesize-project
 *
 * Reads all entity mentions for a project and synthesizes a living document:
 * - Overview of what the project is
 * - Decisions log (extracted from session discussions)
 * - Action items (open/done)
 * - Roadmap (inferred from discussions about future plans)
 * - Technical notes (for tech projects)
 * - Narrative overview (for book/creative projects)
 * - Origin story (how it started)
 *
 * Triggered by: app/project.synthesize event
 * Can be re-triggered at any time to regenerate from accumulated context.
 */

import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { ProjectDocumentType } from '@/types/database'

type SynthesizeProjectEvent = {
  name: 'app/project.synthesize'
  data: {
    entity_id: string
    user_id: string
  }
}

export const synthesizeProject = inngest.createFunction(
  {
    id: 'synthesize-project',
    name: 'Synthesize Project Living Document',
    retries: 2,
  },
  { event: 'app/project.synthesize' },
  async ({ event, step }) => {
    const { entity_id, user_id } = event.data

    const admin = createAdminClient()
    if (!admin) throw new Error('Admin client not available')

    // ── Step 1: Fetch entity + all mentions + AI keys ──────────────────────
    const context = await step.run('fetch-context', async () => {
      const [entityRes, mentionsRes, openaiKey, anthropicKey] = await Promise.all([
        admin
          .from('entities')
          .select('id, name, slug, type, status, metadata, mention_count, first_mentioned_at')
          .eq('id', entity_id)
          .eq('user_id', user_id)
          .single(),
        admin
          .from('entity_mentions')
          .select('id, context, full_context, sentiment, created_at, video_upload_id, log_entry_id, source_type, video_uploads(id, file_name, recorded_at, created_at, transcript_segments)')
          .eq('entity_id', entity_id)
          .order('created_at', { ascending: true }),
        resolveProviderKeyWithClient(admin, user_id, 'openai'),
        resolveProviderKeyWithClient(admin, user_id, 'anthropic'),
      ])

      if (!entityRes.data) throw new Error('Entity not found')
      if (!openaiKey && !anthropicKey) throw new Error('No AI key configured')

      // Determine project_type from entity metadata or existing document
      const existingDocRes = await admin
        .from('project_documents')
        .select('project_type, manual_notes')
        .eq('entity_id', entity_id)
        .maybeSingle()

      const projectType: ProjectDocumentType =
        existingDocRes.data?.project_type ||
        entityRes.data.metadata?.project_type ||
        'tech'

      const manualNotes: string | null = existingDocRes.data?.manual_notes || null

      return {
        entity: entityRes.data,
        mentions: mentionsRes.data || [],
        openaiKey: openaiKey?.key || null,
        anthropicKey: anthropicKey?.key || null,
        projectType,
        manualNotes,
      }
    })

    // ── Step 2: Synthesize the living document ──────────────────────────────
    const document = await step.run('synthesize-document', async () => {
      const { entity, mentions, projectType } = context

      // Build the session journal — each mention becomes a dated entry with upload metadata
      const sessionJournal = mentions
        .map((m: any) => {
          const source = m.video_uploads
          const date = source?.recorded_at || source?.created_at || m.created_at
          const dateStr = new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          const body = m.full_context || m.context || ''
          if (!body) return null
          const uploadMeta = source
            ? `upload_id:${source.id} file:${source.file_name}`
            : ''
          return `[${dateStr}]${uploadMeta ? ` (${uploadMeta})` : ''}\n${body}`
        })
        .filter(Boolean)
        .join('\n\n---\n\n')

      if (!sessionJournal.trim()) {
        return {
          overview: `No detailed discussion captured yet for "${entity.name}". Upload and process videos to populate this document.`,
          decisions_log: [],
          action_items: [],
          roadmap: [],
          technical_notes: null,
          narrative_overview: null,
          origin_story: null,
        }
      }

      const isTech = projectType === 'tech' || projectType === 'business'
      const isNarrative = projectType === 'book' || projectType === 'creative'

      const systemPrompt = `You are a project intelligence synthesizer. You receive all the session notes from every recorded discussion about a project and produce a structured living document. Be precise, specific, and extractive — pull actual decisions, actual action items, actual plans from the notes. Don't be vague or generic.`

      const userPrompt = `Project: "${entity.name}"
Type: ${projectType}
Total sessions: ${mentions.length}
First mentioned: ${entity.first_mentioned_at ? new Date(entity.first_mentioned_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'unknown'}

Session Journal (chronological):
${sessionJournal}

Synthesize this into a JSON living document with these fields:

- "overview": 2-3 paragraph synthesis of what this project is, its purpose, current state, and direction. Be specific and concrete.
- "origin_story": 1-2 paragraphs on how this project started — the first spark, the initial problem, what prompted it. Extract from the earliest sessions.
- "decisions_log": array of specific decisions made about this project. Each: {"decision": "...", "reasoning": "... or null", "date": "YYYY-MM-DD or null", "source_upload_id": "the upload_id from the session header where this was decided, or null", "source_timestamp_seconds": estimate the timestamp in seconds within that recording where this was said based on the context (null if unknown), "status": one of "made"|"implemented"|"reversed"|"superseded" — check later sessions to see if this decision was acted on, contradicted, or replaced. "lifecycle_note": if status is not "made", briefly explain what happened in a later session (e.g. "reversed Mar 14 — decided against mobile-first after testing"). Extract actual concrete decisions, not generic statements.
- "action_items": array of concrete next steps or todos mentioned. Each: {"item": "...", "status": "open" or "done" if a later session confirms it was completed, "mentioned_at": "YYYY-MM-DD or null", "source_upload_id": "the upload_id from the session header, or null", "source_timestamp_seconds": estimate timestamp in seconds within that recording (null if unknown)}. Only things framed as todos/next steps.
- "roadmap": array of future plans and goals for this project. Each: {"item": "...", "priority": "high|medium|low", "status": "planned|in_progress|done"}.
${isTech ? `- "technical_notes": synthesis of all technical architecture, stack choices, infrastructure decisions, integrations, and technical problems discussed. Write as a technical reference document. Be specific about technologies, patterns, and reasoning.` : `- "technical_notes": null`}
${isNarrative ? `- "narrative_overview": synthesis of the narrative arc, story structure, themes, and content discussed across sessions. What is the story arc? What chapters or sections are taking shape? What themes keep emerging?` : `- "narrative_overview": null`}

Return valid JSON only. No markdown. No explanation outside the JSON.`

      let raw = ''

      if (context.anthropicKey) {
        const anthropic = new Anthropic({ apiKey: context.anthropicKey })
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        })
        raw = (response.content[0] as any).text || ''
      } else {
        const openai = new OpenAI({ apiKey: context.openaiKey! })
        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          max_tokens: 4000,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        })
        raw = response.choices[0]?.message?.content || ''
      }

      // Parse JSON — strip markdown code fences if present
      const jsonStr = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim()
      const parsed = JSON.parse(jsonStr)

      return {
        overview: parsed.overview || null,
        decisions_log: Array.isArray(parsed.decisions_log) ? parsed.decisions_log : [],
        action_items: Array.isArray(parsed.action_items) ? parsed.action_items : [],
        roadmap: Array.isArray(parsed.roadmap) ? parsed.roadmap : [],
        technical_notes: parsed.technical_notes || null,
        narrative_overview: parsed.narrative_overview || null,
        origin_story: parsed.origin_story || null,
      }
    })

    // ── Step 3: Save to project_documents ──────────────────────────────────
    await step.run('save-document', async () => {
      const now = new Date().toISOString()
      const model = context.anthropicKey ? 'claude-sonnet-4-6' : 'gpt-4o'

      // Read existing doc to snapshot the current state before overwriting
      const { data: existing } = await admin
        .from('project_documents')
        .select('decisions_log, action_items, roadmap, last_synthesized_at, mention_count_at_synthesis, synthesis_history')
        .eq('entity_id', entity_id)
        .maybeSingle()

      // Build updated history — keep last 10 snapshots
      const prevHistory: any[] = existing?.synthesis_history || []
      const newHistory = [
        ...prevHistory,
        ...(existing?.last_synthesized_at ? [{
          synthesized_at: existing.last_synthesized_at,
          mention_count: existing.mention_count_at_synthesis ?? 0,
          decisions_log: existing.decisions_log ?? [],
          action_items: existing.action_items ?? [],
          roadmap: existing.roadmap ?? [],
        }] : []),
      ].slice(-10)

      await admin
        .from('project_documents')
        .upsert(
          {
            user_id,
            entity_id,
            project_type: context.projectType,
            manual_notes: context.manualNotes,
            overview: document.overview,
            decisions_log: document.decisions_log,
            action_items: document.action_items,
            roadmap: document.roadmap,
            technical_notes: document.technical_notes,
            narrative_overview: document.narrative_overview,
            origin_story: document.origin_story,
            synthesis_history: newHistory,
            last_synthesized_at: now,
            synthesis_model: model,
            mention_count_at_synthesis: context.mentions.length,
            updated_at: now,
          },
          { onConflict: 'entity_id' },
        )
    })

    return { ok: true, entity_id }
  },
)
