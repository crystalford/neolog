import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'

const SCRIPT_PROMPT = `You are a video script writer. You will receive a transcript and analysis from a personal brain-dump recording.

Your task: write a tight, compelling script for a short-form video (2–4 minutes) based on the strongest idea from this session.

Return ONLY valid JSON with this shape:
{
  "title": "short punchy title",
  "script_mode": "essay" | "story",
  "total_duration_seconds": number,
  "segments": [
    {
      "order": 1,
      "type": "hook" | "setup" | "development" | "turn" | "payoff" | "cta",
      "narration": "exact words to say",
      "visual_direction": "what the viewer sees",
      "duration_seconds": number
    }
  ]
}

Rules:
- Hook must grab in under 10 seconds
- Each segment 10–40 seconds
- Total under 4 minutes
- Write narration as first-person, present tense, conversational
- No filler, no corporate-speak
- End with a clear payoff or call to action`

type StudioProduceEvent = {
  name: 'studio/produce'
  data: {
    production_id: string
    script_id: string
    upload_id: string
    user_id: string
    style_card: {
      register: string
      palette: string
      reference?: string
    } | null
    selected_idea: { text: string; format: string } | null
  }
}

export const produceStudioVideo = inngest.createFunction(
  {
    id: 'produce-studio-video',
    name: 'Produce Studio Video',
    retries: 1,
    timeouts: { finish: '20m' },
  },
  { event: 'studio/produce' },
  async ({ event, step }) => {
    const { production_id, script_id, upload_id, user_id, style_card, selected_idea } = event.data
    const admin = createAdminClient()
    if (!admin) throw new Error('Admin client not available')

    const markStatus = async (status: string, error?: string) => {
      await admin.from('productions').update({
        status,
        error_message: error ?? null,
        updated_at: new Date().toISOString(),
      }).eq('id', production_id)
    }

    // ── Step 1: Load upload + user keys ──
    const context = await step.run('load-context', async () => {
      await markStatus('running')

      const { data: upload, error: uploadErr } = await admin
        .from('video_uploads')
        .select('id, transcript, analysis, file_name, session_id')
        .eq('id', upload_id)
        .eq('user_id', user_id)
        .single()

      if (uploadErr || !upload) throw new Error('Upload not found')

      const { data: integrations } = await admin
        .from('user_integrations')
        .select('provider, encrypted_key')
        .eq('user_id', user_id)
        .in('provider', ['anthropic', 'openai'])

      const anthropicRow = integrations?.find(i => i.provider === 'anthropic')
      const openaiRow = integrations?.find(i => i.provider === 'openai')

      return {
        transcript: upload.transcript as string | null,
        analysis: upload.analysis as any,
        fileName: upload.file_name,
        anthropicKey: anthropicRow?.encrypted_key ?? process.env.ANTHROPIC_API_KEY ?? null,
        openaiKey: openaiRow?.encrypted_key ?? null,
      }
    })

    if (!context.transcript && !context.analysis) {
      await markStatus('error', 'No transcript or analysis available. Run the upload pipeline first.')
      return { status: 'error', production_id }
    }

    // ── Step 2: Generate script via Claude ──
    const scriptJson = await step.run('generate-script', async () => {
      const transcript = context.transcript ?? ''
      const analysis = context.analysis ?? {}

      // Prefer the user-selected idea from debrief; fall back to top analysis idea
      const topIdeaText = selected_idea?.text
        ?? (analysis.content_ideas?.[0]
          ? (typeof analysis.content_ideas[0] === 'object' ? analysis.content_ideas[0].topic : String(analysis.content_ideas[0]))
          : null)
      const keyWin = analysis.key_win ?? ''
      const keyQuotes = (analysis.key_quotes ?? []).slice(0, 3).join('\n')
      const strongOpinions = (analysis.strong_opinions ?? []).slice(0, 2).join('\n')
      const styleContext = style_card
        ? `\nVisual style: ${style_card.register} register, palette "${style_card.palette}"${style_card.reference ? `, reference: "${style_card.reference}"` : ''}`
        : ''

      const userPrompt = [
        topIdeaText ? `Strongest idea: ${topIdeaText}` : '',
        keyWin ? `Key insight: ${keyWin}` : '',
        keyQuotes ? `Key quotes:\n${keyQuotes}` : '',
        strongOpinions ? `Strong opinions:\n${strongOpinions}` : '',
        styleContext,
        '\nTranscript excerpt (first 3000 chars):',
        transcript.slice(0, 3000),
      ].filter(Boolean).join('\n')

      if (context.anthropicKey) {
        const anthropic = new Anthropic({ apiKey: context.anthropicKey })
        const msg = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system: SCRIPT_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
          temperature: 0.6,
        })
        const text = msg.content.find(c => c.type === 'text')
        if (!text || text.type !== 'text') throw new Error('No text in Claude response')
        const cleaned = text.text.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim()
        return JSON.parse(cleaned)
      }

      // Fallback: minimal placeholder script
      return {
        title: context.fileName?.replace(/\.[^.]+$/, '') ?? 'Untitled',
        script_mode: 'essay',
        total_duration_seconds: 120,
        segments: [{
          order: 1, type: 'hook',
          narration: keyWin || topIdeaText || 'Here is what I want to tell you.',
          visual_direction: 'Talking head, medium shot.',
          duration_seconds: 120,
        }],
      }
    })

    // ── Step 3: Save script JSON ──
    await step.run('save-script', async () => {
      await admin.from('scripts').update({
        title: scriptJson.title ?? 'Untitled',
        script_json: scriptJson.segments ?? [],
        script_mode: scriptJson.script_mode ?? 'essay',
        total_duration_seconds: scriptJson.total_duration_seconds ?? null,
        status: 'approved',
        updated_at: new Date().toISOString(),
      }).eq('id', script_id)
    })

    // ── Step 4: Mark production done (video assembly is phase 2) ──
    await step.run('finalize', async () => {
      await admin.from('productions').update({
        status: 'done',
        updated_at: new Date().toISOString(),
      }).eq('id', production_id)
    })

    return { status: 'done', production_id, script_id, segments: scriptJson.segments?.length ?? 0 }
  },
)
