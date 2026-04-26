export const runtime = 'edge'

import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM = `You are a creative producer and thought partner helping someone develop ideas from their recent recording session.

You have context from their session analysis: key insight, surfaced ideas, strong opinions, pull quotes. Your job:
- Help them identify which idea is most worth developing right now
- Ask sharp questions to deepen their thinking
- Surface angles and framings they haven't considered
- When they commit to an idea, help sharpen the hook and the narrative

Be direct. No padding, no equivocating. Treat them as a smart creator who knows their subject. Keep responses tight — 2–4 sentences unless they need more.`

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { upload_id, messages } = await req.json()
  if (!upload_id || !messages?.length) return new Response('upload_id and messages required', { status: 400 })

  const [uploadRes, keysRes] = await Promise.all([
    supabase
      .from('video_uploads')
      .select('analysis, file_name')
      .eq('id', upload_id)
      .eq('user_id', session.user.id)
      .single(),
    supabase
      .from('integration_keys')
      .select('provider, key_value')
      .eq('user_id', session.user.id)
      .eq('provider', 'anthropic')
      .eq('is_active', true)
      .limit(1),
  ])

  if (!uploadRes.data) return new Response('Upload not found', { status: 404 })

  const anthropicKey = keysRes.data?.[0]?.key_value ?? process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) return new Response('No Anthropic API key configured — add one in Settings', { status: 422 })

  const analysis = uploadRes.data.analysis as any
  const contextLines = [
    uploadRes.data.file_name ? `Session: ${uploadRes.data.file_name.replace(/\.[^.]+$/, '')}` : '',
    analysis?.key_win ? `Key insight: "${analysis.key_win}"` : '',
    analysis?.content_ideas?.length
      ? `Ideas:\n${(analysis.content_ideas as any[]).slice(0, 5).map((i: any) => `- ${typeof i === 'object' ? i.topic : i}`).join('\n')}`
      : '',
    analysis?.strong_opinions?.length
      ? `Strong opinions:\n${(analysis.strong_opinions as string[]).slice(0, 3).map(o => `- ${o}`).join('\n')}`
      : '',
    analysis?.key_quotes?.length
      ? `Key quotes:\n${(analysis.key_quotes as string[]).slice(0, 3).map(q => `- "${q}"`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n\n')

  const systemPrompt = SYSTEM + (contextLines ? `\n\n---\n\nSESSION CONTEXT:\n${contextLines}` : '')

  const anthropic = new Anthropic({ apiKey: anthropicKey })
  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: (messages as Array<{ role: string; content: string }>).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  })

  const enc = new TextEncoder()
  return new Response(
    new ReadableStream({
      async start(ctrl) {
        try {
          for await (const ev of stream) {
            if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
              ctrl.enqueue(enc.encode(ev.delta.text))
            }
          }
        } finally {
          ctrl.close()
        }
      },
    }),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  )
}
