export const runtime = 'edge'

import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const PLANNER_PROMPT = `You are an expert video editor AI. You will receive a list of personal video recordings with their timed transcripts.

Your task: select the best 4-8 segments across all videos to assemble into an engaging edit.

Return ONLY valid JSON:
{
  "title": "punchy title for this edit (5-8 words)",
  "segments": [
    {
      "upload_id": "uuid string",
      "start": 12.5,
      "end": 45.0,
      "reason": "why this moment is compelling — one sentence",
      "quote": "exact words spoken in this segment"
    }
  ]
}

Rules:
- Each segment must be 10-60 seconds long (end - start between 10 and 60)
- Prefer moments with: genuine insight, high energy, strong opinions, memorable quotes, clear narrative
- For a specific topic: only pick segments directly on that topic
- For "best of": pick the most engaging moments regardless of topic
- Only use upload_ids from the provided videos list
- Do not overlap segments from the same upload`

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { topic, upload_ids } = await req.json()

  // Load recent uploads that have been processed and have transcripts
  let query = supabase
    .from('video_uploads')
    .select('id, file_name, analysis, transcript_segments, recorded_at')
    .eq('user_id', session.user.id)
    .eq('status', 'ready')
    .not('transcript_segments', 'is', null)
    .order('recorded_at', { ascending: false })
    .limit(15)

  if (upload_ids?.length) query = query.in('id', upload_ids)

  const { data: uploads, error } = await query
  if (error || !uploads?.length) {
    return Response.json({ error: 'No processed uploads found with transcripts' }, { status: 422 })
  }

  // Resolve Anthropic key
  const { data: integration } = await supabase
    .from('user_integrations')
    .select('encrypted_key')
    .eq('user_id', session.user.id)
    .eq('provider', 'anthropic')
    .single()

  const apiKey = integration?.encrypted_key ?? process.env.ANTHROPIC_API_KEY
  if (!apiKey) return Response.json({ error: 'No Anthropic API key configured' }, { status: 422 })

  // Build per-upload context with timed transcript segments
  const uploadContext = uploads.map(u => {
    const analysis = (u.analysis as any) ?? {}
    const segs = (u.transcript_segments ?? []) as Array<{ start: number; end: number; text: string }>
    const title = analysis.title ?? u.file_name?.replace(/\.[^.]+$/, '') ?? 'Untitled'

    const segLines = segs
      .map(s => `  [${s.start.toFixed(1)}s–${s.end.toFixed(1)}s] ${s.text.trim()}`)
      .join('\n')

    return [
      `## ${u.id}`,
      `Title: ${title}`,
      `Energy: ${analysis.energy_level ?? 'unknown'}`,
      `Key insight: ${analysis.key_win ?? 'n/a'}`,
      `Strong opinions: ${(analysis.strong_opinions ?? []).slice(0, 3).join(' | ') || 'n/a'}`,
      `Transcript:`,
      segLines || '(no timed segments)',
    ].join('\n')
  }).join('\n\n---\n\n')

  const userPrompt = [
    `Topic: ${topic?.trim() || 'Best of — highlight reel'}`,
    '',
    uploadContext,
  ].join('\n')

  const anthropic = new Anthropic({ apiKey })
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: PLANNER_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const textBlock = msg.content.find(c => c.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    return Response.json({ error: 'No response from AI' }, { status: 500 })
  }

  try {
    const cleaned = textBlock.text.replace(/^```json\s*/m, '').replace(/\s*```$/m, '').trim()
    const plan = JSON.parse(cleaned)

    // Annotate segments with human-readable upload names
    const uploadMap = Object.fromEntries(uploads.map(u => [u.id, u]))
    plan.segments = (plan.segments ?? []).map((s: any) => ({
      ...s,
      upload_name: (uploadMap[s.upload_id]?.analysis as any)?.title
        ?? uploadMap[s.upload_id]?.file_name?.replace(/\.[^.]+$/, '')
        ?? s.upload_id,
    }))

    return Response.json(plan)
  } catch {
    return Response.json({ error: 'AI returned malformed JSON', raw: textBlock.text.slice(0, 500) }, { status: 500 })
  }
}
