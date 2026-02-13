import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProviderKey } from '@/lib/ai-provider'
import { NextRequest, NextResponse } from 'next/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 120

const ANALYSIS_SYSTEM_PROMPT = `You are a personal content analyst for the Neolog platform. Your job is to analyze a transcript from a raw video recording and extract structured, actionable information.

The user records daily video logs — these are raw, unedited, stream-of-consciousness recordings about their life, work, ideas, and projects.

Analyze the transcript and return a JSON object with this exact structure:

{
  "summary": "A 2-3 sentence summary of what was discussed in this recording",
  "categories": [
    {"name": "category name", "confidence": 0.0-1.0}
  ],
  "ideas": ["idea 1", "idea 2"],
  "projects": ["project or thing being worked on"],
  "action_items": ["concrete next step or task mentioned"],
  "life_events": ["notable personal life event or update"],
  "topics": ["topic1", "topic2"],
  "mood": "overall emotional tone (e.g. energized, reflective, frustrated, excited)",
  "key_quotes": ["verbatim compelling quotes that could work as social media posts"]
}

Categories should be things like: "work", "personal", "ideas", "health", "relationships", "projects", "learning", "goals", "reflection", "creative", "business", "tech".

For key_quotes, pick the most insightful, memorable, or shareable things said — limit to 5 max.

For ideas, extract any novel concept, business idea, product idea, or creative vision mentioned.

For projects, identify any ongoing work, side projects, or endeavors being discussed.

IMPORTANT: Return ONLY the JSON object. No markdown, no code fences, no explanation.`

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
      const run = await startJobRun('video-upload.analyze', {
        user_id: session.user.id,
        video_upload_id,
      })
      runId = run.id
    } catch {
      // best-effort
    }

    finalMeta = { user_id: session.user.id, video_upload_id }

    // Get upload with transcript
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

    if (!upload.transcript) {
      finalErrorMessage = 'No transcript available. Transcribe the video first.'
      return NextResponse.json({ error: finalErrorMessage }, { status: 400 })
    }

    if (upload.analysis) {
      return NextResponse.json({
        id: upload.id,
        analysis: upload.analysis,
        message: 'Already analyzed',
      })
    }

    // Update status
    const admin = createAdminClient()
    if (admin) {
      await admin
        .from('video_uploads')
        .update({ status: 'analyzing', updated_at: new Date().toISOString() })
        .eq('id', video_upload_id)
    }

    // Try OpenAI first, then Anthropic
    const openaiKey = await resolveProviderKey(session.user.id, 'openai')
    const anthropicKey = await resolveProviderKey(session.user.id, 'anthropic')

    if (!openaiKey && !anthropicKey) {
      finalErrorMessage = 'API key required for analysis'
      return NextResponse.json({
        error: 'An OpenAI or Anthropic API key is required. Add one in Settings > API Keys.',
      }, { status: 402 })
    }

    let analysisText = ''
    let modelUsed = ''

    const userPrompt = `Here is the transcript from my video recording. Please analyze it:\n\n${upload.transcript}`

    if (openaiKey) {
      const openai = new OpenAI({ apiKey: openaiKey.key })
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
      })
      analysisText = completion.choices[0].message.content || ''
      modelUsed = 'gpt-4o'
    } else if (anthropicKey) {
      const anthropic = new Anthropic({ apiKey: anthropicKey.key })
      const message = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 4096,
        system: ANALYSIS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      })
      const textContent = message.content.find(c => c.type === 'text')
      if (textContent && textContent.type === 'text') {
        analysisText = textContent.text
      }
      modelUsed = 'claude-3-5-sonnet'
    }

    // Parse the JSON analysis
    let analysis
    try {
      // Strip any markdown code fences if present
      const cleaned = analysisText
        .replace(/^```json?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim()
      analysis = JSON.parse(cleaned)
    } catch (parseError) {
      console.error('Failed to parse analysis JSON:', parseError)
      finalErrorMessage = 'Failed to parse analysis output'
      if (admin) {
        await admin
          .from('video_uploads')
          .update({
            status: 'error',
            error_message: 'Analysis produced invalid JSON',
            updated_at: new Date().toISOString(),
          })
          .eq('id', video_upload_id)
      }
      return NextResponse.json({ error: 'Analysis parsing failed' }, { status: 500 })
    }

    // Extract tags from categories and topics
    const tags = [
      ...(analysis.categories?.map((c: any) => c.name) || []),
      ...(analysis.topics || []),
    ].filter(Boolean).map((t: string) => t.toLowerCase())
    const uniqueTags = [...new Set(tags)]

    // Generate suggested clips from key quotes + segments
    const generatedClips = generateClipSuggestions(
      upload.transcript_segments || [],
      analysis.key_quotes || [],
    )

    // Generate post suggestions
    const generatedPosts = generatePostSuggestions(analysis)

    // Save analysis
    const updateData: Record<string, any> = {
      analysis,
      analysis_model: modelUsed,
      tags: uniqueTags,
      generated_clips: generatedClips,
      generated_posts: generatedPosts,
      status: 'processed',
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    if (admin) {
      await admin
        .from('video_uploads')
        .update(updateData)
        .eq('id', video_upload_id)
    }

    finalStatus = 'success'
    finalMeta = {
      ...finalMeta,
      model: modelUsed,
      categories_count: analysis.categories?.length || 0,
      ideas_count: analysis.ideas?.length || 0,
      clips_count: generatedClips.length,
      posts_count: generatedPosts.length,
    }

    return NextResponse.json({
      id: video_upload_id,
      analysis,
      generated_clips: generatedClips,
      generated_posts: generatedPosts,
      tags: uniqueTags,
      status: 'processed',
    })
  } catch (error: any) {
    console.error('Analysis error:', error)
    finalErrorMessage = error.message || 'Analysis failed'

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

    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
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

// Find transcript segments that match key quotes for clip suggestions
function generateClipSuggestions(
  segments: Array<{ start: number; end: number; text: string }>,
  keyQuotes: string[],
) {
  if (!segments.length || !keyQuotes.length) return []

  const clips: Array<{
    start: number
    end: number
    title: string
    transcript: string
    platform: string
  }> = []

  for (const quote of keyQuotes.slice(0, 5)) {
    const quoteLower = quote.toLowerCase()
    // Find the segment(s) containing this quote
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      if (quoteLower.includes(seg.text.toLowerCase().trim()) ||
          seg.text.toLowerCase().trim().includes(quoteLower.substring(0, 30))) {
        // Take this segment plus a few surrounding for context
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

// Generate post suggestions from analysis
function generatePostSuggestions(analysis: any) {
  const posts: Array<{
    title: string
    content: string
    type: string
  }> = []

  // Log entry from summary
  if (analysis.summary) {
    posts.push({
      title: `Daily Log: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
      content: analysis.summary,
      type: 'log',
    })
  }

  // Idea posts
  if (analysis.ideas?.length > 0) {
    for (const idea of analysis.ideas.slice(0, 3)) {
      posts.push({
        title: idea.length > 80 ? idea.substring(0, 77) + '...' : idea,
        content: idea,
        type: 'idea',
      })
    }
  }

  // Project updates
  if (analysis.projects?.length > 0) {
    posts.push({
      title: `Project Update: ${analysis.projects[0]}`,
      content: `Working on: ${analysis.projects.join(', ')}`,
      type: 'project_update',
    })
  }

  return posts
}
