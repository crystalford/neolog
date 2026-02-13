import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProviderKey } from '@/lib/ai-provider'
import { NextRequest, NextResponse } from 'next/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 300

/**
 * POST /api/video-upload/process
 *
 * One-shot pipeline: given a video_upload_id that's been uploaded,
 * runs transcription → analysis → generates outputs.
 * This is the "just process it" endpoint the UI calls after upload.
 */
export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { video_upload_id } = body

    if (!video_upload_id) {
      return NextResponse.json({ error: 'video_upload_id is required' }, { status: 400 })
    }

    try {
      const run = await startJobRun('video-upload.process', {
        user_id: session.user.id,
        video_upload_id,
      })
      runId = run.id
    } catch {
      // best-effort
    }

    finalMeta = { user_id: session.user.id, video_upload_id }

    // Verify ownership
    const { data: upload, error: fetchError } = await supabase
      .from('video_uploads')
      .select('*')
      .eq('id', video_upload_id)
      .eq('user_id', session.user.id)
      .single()

    if (fetchError || !upload) {
      finalErrorMessage = 'Upload not found'
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
    }

    // Check keys are available
    const openaiKey = await resolveProviderKey(session.user.id, 'openai')
    if (!openaiKey) {
      finalErrorMessage = 'OpenAI API key required'
      return NextResponse.json({
        error: 'OpenAI API key required for transcription. Add one in Settings > API Keys.',
      }, { status: 402 })
    }

    const anthropicKey = await resolveProviderKey(session.user.id, 'anthropic')
    const admin = createAdminClient()

    // ========== STEP 1: Transcribe ==========
    let transcript = upload.transcript
    let transcriptSegments = upload.transcript_segments
    let duration = upload.duration_seconds

    if (!transcript) {
      if (admin) {
        await admin
          .from('video_uploads')
          .update({ status: 'transcribing', updated_at: new Date().toISOString() })
          .eq('id', video_upload_id)
      }

      // Download file
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('videos')
        .download(upload.storage_path)

      if (downloadError || !fileData) {
        finalErrorMessage = 'Failed to download file from storage'
        if (admin) {
          await admin
            .from('video_uploads')
            .update({ status: 'error', error_message: finalErrorMessage, updated_at: new Date().toISOString() })
            .eq('id', video_upload_id)
        }
        return NextResponse.json({ error: finalErrorMessage }, { status: 500 })
      }

      const openai = new OpenAI({ apiKey: openaiKey.key })
      const file = new File([fileData], upload.file_name, { type: upload.mime_type })

      const transcription = await openai.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['segment'],
      })

      transcript = transcription.text
      transcriptSegments = (transcription as any).segments?.map((s: any) => ({
        start: s.start,
        end: s.end,
        text: s.text,
      })) || []
      const language = (transcription as any).language || null
      duration = (transcription as any).duration || null

      const transcriptUpdate: Record<string, any> = {
        transcript,
        transcript_segments: transcriptSegments,
        transcript_language: language,
        transcript_model: 'whisper-1',
        updated_at: new Date().toISOString(),
      }
      if (duration) transcriptUpdate.duration_seconds = duration

      if (admin) {
        await admin
          .from('video_uploads')
          .update(transcriptUpdate)
          .eq('id', video_upload_id)
      }

      finalMeta.transcript_length = transcript.length
      finalMeta.segments_count = transcriptSegments.length
    }

    // ========== STEP 2: Analyze ==========
    if (!upload.analysis) {
      if (admin) {
        await admin
          .from('video_uploads')
          .update({ status: 'analyzing', updated_at: new Date().toISOString() })
          .eq('id', video_upload_id)
      }

      const analysisPrompt = `You are a personal content analyst. Analyze this transcript from a raw video recording and extract structured information.

Return a JSON object with this exact structure:
{
  "summary": "2-3 sentence summary",
  "categories": [{"name": "category", "confidence": 0.0-1.0}],
  "ideas": ["idea 1"],
  "projects": ["project 1"],
  "action_items": ["task 1"],
  "life_events": ["event 1"],
  "topics": ["topic1"],
  "mood": "overall tone",
  "key_quotes": ["best verbatim quotes for social media, max 5"]
}

Categories: work, personal, ideas, health, relationships, projects, learning, goals, reflection, creative, business, tech.
Return ONLY the JSON. No markdown, no code fences.`

      let analysisText = ''
      let modelUsed = ''
      const userPrompt = `Transcript:\n\n${transcript}`

      // Prefer Anthropic for analysis (better at structured extraction), fallback to OpenAI
      if (anthropicKey) {
        const anthropic = new Anthropic({ apiKey: anthropicKey.key })
        const message = await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20240620',
          max_tokens: 4096,
          system: analysisPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          temperature: 0.3,
        })
        const textContent = message.content.find(c => c.type === 'text')
        if (textContent && textContent.type === 'text') {
          analysisText = textContent.text
        }
        modelUsed = 'claude-3-5-sonnet'
      } else {
        const openai = new OpenAI({ apiKey: openaiKey.key })
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: analysisPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
        })
        analysisText = completion.choices[0].message.content || ''
        modelUsed = 'gpt-4o'
      }

      // Parse JSON
      let analysis
      try {
        const cleaned = analysisText
          .replace(/^```json?\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim()
        analysis = JSON.parse(cleaned)
      } catch {
        finalErrorMessage = 'Analysis produced invalid JSON'
        if (admin) {
          await admin
            .from('video_uploads')
            .update({ status: 'error', error_message: finalErrorMessage, updated_at: new Date().toISOString() })
            .eq('id', video_upload_id)
        }
        return NextResponse.json({ error: finalErrorMessage }, { status: 500 })
      }

      // Generate tags, clips, posts
      const tags = [
        ...(analysis.categories?.map((c: any) => c.name) || []),
        ...(analysis.topics || []),
      ].filter(Boolean).map((t: string) => t.toLowerCase())
      const uniqueTags = [...new Set(tags)]

      const generatedClips = generateClipSuggestions(transcriptSegments || [], analysis.key_quotes || [])
      const generatedPosts = generatePostSuggestions(analysis)

      if (admin) {
        await admin
          .from('video_uploads')
          .update({
            analysis,
            analysis_model: modelUsed,
            tags: uniqueTags,
            generated_clips: generatedClips,
            generated_posts: generatedPosts,
            status: 'processed',
            processed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', video_upload_id)
      }

      finalMeta.analysis_model = modelUsed
      finalMeta.tags_count = uniqueTags.length
      finalMeta.clips_count = generatedClips.length
    } else {
      // Already analyzed
      if (admin) {
        await admin
          .from('video_uploads')
          .update({ status: 'processed', processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', video_upload_id)
      }
    }

    finalStatus = 'success'

    // Fetch final state
    const { data: result } = await supabase
      .from('video_uploads')
      .select('*')
      .eq('id', video_upload_id)
      .single()

    return NextResponse.json({
      id: video_upload_id,
      status: 'processed',
      upload: result,
    })
  } catch (error: any) {
    console.error('Processing pipeline error:', error)
    finalErrorMessage = error.message || 'Processing failed'

    try {
      const admin = createAdminClient()
      if (admin) {
        const body = await request.clone().json().catch(() => ({}))
        if (body.video_upload_id) {
          await admin
            .from('video_uploads')
            .update({ status: 'error', error_message: finalErrorMessage, updated_at: new Date().toISOString() })
            .eq('id', body.video_upload_id)
        }
      }
    } catch {
      // best-effort
    }

    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  } finally {
    try {
      if (runId) {
        await finishJobRun(
          runId,
          finalStatus,
          { duration_ms: Date.now() - startedAt, ...finalMeta },
          finalErrorMessage,
        )
      }
    } catch {
      // best-effort
    }
  }
}

function generateClipSuggestions(
  segments: Array<{ start: number; end: number; text: string }>,
  keyQuotes: string[],
) {
  if (!segments.length || !keyQuotes.length) return []

  const clips: Array<{ start: number; end: number; title: string; transcript: string; platform: string }> = []

  for (const quote of keyQuotes.slice(0, 5)) {
    const quoteLower = quote.toLowerCase()
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      if (quoteLower.includes(seg.text.toLowerCase().trim()) ||
          seg.text.toLowerCase().trim().includes(quoteLower.substring(0, 30))) {
        const startIdx = Math.max(0, i - 1)
        const endIdx = Math.min(segments.length - 1, i + 2)
        const clipSegments = segments.slice(startIdx, endIdx + 1)
        const clipTranscript = clipSegments.map(s => s.text).join(' ').trim()

        clips.push({
          start: clipSegments[0].start,
          end: clipSegments[clipSegments.length - 1].end,
          title: quote.length > 60 ? quote.substring(0, 57) + '...' : quote,
          transcript: clipTranscript,
          platform: 'general',
        })
        break
      }
    }
  }

  return clips
}

function generatePostSuggestions(analysis: any) {
  const posts: Array<{ title: string; content: string; type: string }> = []

  if (analysis.summary) {
    posts.push({
      title: `Daily Log: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
      content: analysis.summary,
      type: 'log',
    })
  }

  if (analysis.ideas?.length > 0) {
    for (const idea of analysis.ideas.slice(0, 3)) {
      posts.push({
        title: idea.length > 80 ? idea.substring(0, 77) + '...' : idea,
        content: idea,
        type: 'idea',
      })
    }
  }

  if (analysis.projects?.length > 0) {
    posts.push({
      title: `Project Update: ${analysis.projects[0]}`,
      content: `Working on: ${analysis.projects.join(', ')}`,
      type: 'project_update',
    })
  }

  return posts
}
