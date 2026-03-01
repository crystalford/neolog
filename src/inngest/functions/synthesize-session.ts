/**
 * Inngest function: synthesize-clip-session
 *
 * Triggered when the user requests synthesis on a session with processed clips.
 * Analyzes all clips together to find themes, narrative arcs, and connections,
 * then generates edit decision lists (EDLs) — ordered hard-cut sequences that
 * each tell a coherent story from the raw material.
 */

import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { ClipSynthesis, EditPlan, EditDecision } from '@/types/database'

type SynthesizeSessionEvent = {
  name: 'clip-session/synthesize'
  data: {
    session_id: string
    user_id: string
  }
}

export const synthesizeSession = inngest.createFunction(
  {
    id: 'synthesize-clip-session',
    name: 'Synthesize Clip Session',
    retries: 1,
  },
  { event: 'clip-session/synthesize' },
  async ({ event, step }) => {
    const { session_id, user_id } = event.data

    const admin = createAdminClient()
    if (!admin) throw new Error('Admin client not available')

    // ── Step 1: Gather all processed clips in the session ──
    const context = await step.run('gather-clips', async () => {
      await admin.from('clip_sessions').update({
        status: 'processing',
        updated_at: new Date().toISOString(),
      }).eq('id', session_id)

      const { data: clips, error } = await admin
        .from('video_uploads')
        .select('id, file_name, duration_seconds, transcript, transcript_segments, analysis, tags')
        .eq('session_id', session_id)
        .eq('status', 'processed')
        .order('created_at', { ascending: true })

      if (error || !clips || clips.length === 0) {
        throw new Error('No processed clips found in session')
      }

      const openaiKey = await resolveProviderKeyWithClient(admin, user_id, 'openai')
      const anthropicKey = await resolveProviderKeyWithClient(admin, user_id, 'anthropic')

      if (!openaiKey && !anthropicKey) {
        throw new Error('No AI API key available')
      }

      return { clips, openaiKey: openaiKey?.key || null, anthropicKey: anthropicKey?.key || null }
    })

    // ── Step 2: Cross-clip synthesis + generate edit plans ──
    const result = await step.run('synthesize', async () => {
      const { clips, openaiKey, anthropicKey } = context

      // Build a structured summary of all clips for the prompt
      const clipSummaries = clips.map((clip, i) => {
        const segments = (clip.transcript_segments as Array<{ start: number; end: number; text: string }>) || []
        const analysis = clip.analysis as any

        return `## Clip ${i + 1} (ID: ${clip.id})
File: ${clip.file_name}
Duration: ${clip.duration_seconds ? Math.round(clip.duration_seconds / 60) + ' min' : 'unknown'}
Tags: ${clip.tags?.join(', ') || 'none'}
Summary: ${analysis?.summary || 'N/A'}
Mood: ${analysis?.mood || 'N/A'} | Energy: ${analysis?.energy_level || 'N/A'}
Key ideas: ${analysis?.ideas?.map((i: any) => i.text || i).join('; ') || 'none'}
Strong opinions: ${analysis?.strong_opinions?.join('; ') || 'none'}
Stories told: ${analysis?.stories_told?.join('; ') || 'none'}
Key quotes: ${analysis?.key_quotes?.join('; ') || 'none'}
Recurring themes: ${analysis?.recurring_themes?.join(', ') || 'none'}

Timestamped segments:
${segments.map(s => `[${formatTime(s.start)}-${formatTime(s.end)}] ${s.text.trim()}`).join('\n')}`
      }).join('\n\n---\n\n')

      const totalDuration = clips.reduce((sum, c) => sum + (c.duration_seconds || 0), 0)

      const systemPrompt = `You are an expert video editor and content strategist. You analyze raw, unedited video content and create edit decision lists (EDLs) that transform it into polished, narrative-driven clips.

Your edits use HARD CUTS ONLY — no transitions, no fades. Each segment plays directly into the next.

When generating edit plans:
- Cut at natural speech boundaries (end of sentences, natural pauses)
- Remove tangents, repetition, filler words, and off-topic digressions
- Keep segments where the speaker is clear, energetic, and on-point
- Arrange segments so they build logically — setup → development → payoff
- Each edit plan should feel like one complete, self-contained piece of content
- Prioritize moments where the speaker is making their strongest point clearly

Return valid JSON only. No markdown, no explanation outside the JSON.`

      const userPrompt = `You have ${clips.length} raw video clips (total ~${Math.round(totalDuration / 60)} minutes) from one person's recordings.

Analyze all clips together and return a JSON object with this exact structure:

{
  "synthesis": {
    "themes": ["theme1", "theme2"],
    "narrative_arcs": [
      {
        "title": "Arc title",
        "description": "What story this arc tells",
        "clip_ids": ["clip-uuid-1", "clip-uuid-2"],
        "strength": 0.9
      }
    ],
    "connections": [
      {
        "from_clip_id": "uuid",
        "to_clip_id": "uuid",
        "connection": "How clip A connects to or builds on clip B"
      }
    ],
    "best_moments": [
      {
        "upload_id": "uuid",
        "start": 45.2,
        "end": 78.5,
        "reason": "Why this moment is strong"
      }
    ]
  },
  "edit_plans": [
    {
      "id": "generate-a-uuid-here",
      "title": "Descriptive title for this edit",
      "narrative_summary": "What story this edit tells and why it works",
      "platform": "short_form",
      "target_duration_seconds": 75,
      "segments": [
        {
          "source_upload_id": "uuid",
          "source_file_name": "filename.mp4",
          "start": 12.5,
          "end": 45.0,
          "transcript_excerpt": "Exact words being said in this segment"
        }
      ],
      "assembled_storage_path": null
    }
  ]
}

Rules for edit_plans:
- Generate as many edit plans as the material supports (typically 2-5)
- "short_form": 45-90 seconds, single focused idea, high energy moments — for Reels/TikTok/Shorts
- "long_form": 5-15 minutes, multiple connected ideas woven into a narrative — for YouTube
- "general": 2-5 minutes, balanced — for LinkedIn/Twitter
- Each segment start/end must align with actual transcript segment boundaries
- Only include segments where the speaker is making a clear, on-point contribution to the narrative
- Remove anything where the speaker goes off on a tangent or loses their thread
- Generate unique UUIDs for each edit plan id

Here are all the clips:

${clipSummaries}`

      let responseText: string

      if (anthropicKey) {
        const anthropic = new Anthropic({ apiKey: anthropicKey })
        const response = await anthropic.messages.create({
          model: 'claude-opus-4-6',
          max_tokens: 8192,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        })
        responseText = response.content[0].type === 'text' ? response.content[0].text : ''
      } else {
        const openai = new OpenAI({ apiKey: openaiKey! })
        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          max_tokens: 8192,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
        })
        responseText = response.choices[0].message.content || ''
      }

      let parsed: { synthesis: ClipSynthesis; edit_plans: EditPlan[] }
      try {
        // Strip any markdown code fences if present
        const clean = responseText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
        parsed = JSON.parse(clean)
      } catch (e) {
        throw new Error(`Failed to parse synthesis response: ${e}`)
      }

      return parsed
    })

    // ── Step 3: Save synthesis + edit plans ──
    await step.run('save-synthesis', async () => {
      const totalDuration = context.clips.reduce(
        (sum, c) => sum + (c.duration_seconds || 0), 0,
      )

      await admin.from('clip_sessions').update({
        status: 'synthesized',
        synthesis: result.synthesis,
        synthesis_model: context.anthropicKey ? 'claude-opus-4-6' : 'gpt-4o',
        edit_plans: result.edit_plans,
        total_duration_seconds: totalDuration,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', session_id)
    })

    return {
      status: 'synthesized',
      session_id,
      edit_plan_count: result.edit_plans.length,
      theme_count: result.synthesis.themes.length,
    }
  },
)

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
