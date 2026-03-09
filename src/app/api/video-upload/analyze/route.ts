import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProviderKey } from '@/lib/ai-provider'
import { NextRequest, NextResponse } from 'next/server'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 180

const ANALYSIS_SYSTEM_PROMPT = `You are a comprehensive personal intelligence analyst for the Neolog platform. You analyze raw, unedited video/audio transcripts — stream-of-consciousness recordings about someone's life, work, ideas, and projects.

Your job is to extract EVERYTHING meaningful. Think of yourself as building a living map of this person's mind, work, and life.

CRITICAL — PRIVACY FIRST:
Before anything else, scan for personally identifiable information (PII) and sensitive data:
- Credit card numbers, bank account numbers
- Social security numbers, government IDs
- Passwords, API keys, secret tokens
- Full street addresses (general cities/neighborhoods are fine)
- Phone numbers (unless clearly a business number)
- Other people's private information shared without clear consent
- Sensitive medical details, legal matters

Flag ALL PII in the "pii_detected" array. NEVER include actual PII values in any other field — describe what you found but redact the actual data.

Analyze the transcript and return a JSON object with this EXACT structure:

{
  "summary": "2-3 sentence summary of what was discussed",
  "categories": [{"name": "category", "confidence": 0.0-1.0}],
  "mood": "overall emotional tone (energized, reflective, frustrated, excited, anxious, calm, scattered, focused, etc.)",
  "energy_level": "high" | "medium" | "low",

  "ideas": [
    {"text": "the idea", "type": "business|creative|product|content|philosophical|other", "confidence": 0.0-1.0}
  ],
  "questions": ["unanswered questions, wonderings, 'what if' moments — these are gold"],
  "recurring_themes": ["themes that come up multiple times in this recording"],

  "projects": [
    {"name": "project name", "status": "active|idea|stalled|completed|mentioned", "updates": ["what was said about it"]}
  ],
  "action_items": ["concrete next steps mentioned"],
  "decisions": [
    {"decision": "what was decided", "reasoning": "why, if stated"}
  ],
  "blockers": ["obstacles, friction, what's stopping progress, time sinks"],

  "life_events": ["notable personal events or updates"],
  "habits": [
    {"habit": "the habit", "sentiment": "positive|negative|neutral"}
  ],
  "goals": [
    {"goal": "the goal", "timeframe": "short_term|long_term|unspecified"}
  ],
  "commitments": ["promises to self or others — 'I'm going to...', 'I need to...'"],
  "values_expressed": ["principles, beliefs, things that clearly matter to this person"],

  "people_mentioned": [
    {"name": "name", "context": "how they came up", "relationship": "collaborator|friend|family|influence|acquaintance|other|null"}
  ],

  "references": [
    {"title": "what was referenced", "type": "book|article|video|podcast|person|concept|tool|other"}
  ],
  "skills_mentioned": ["skills being used, learned, or discussed"],
  "lessons_learned": ["realizations, insights, things figured out"],

  "content_ideas": [
    {"topic": "what to create about", "format": "article|video|thread|newsletter|social_post|other"}
  ],
  "stories_told": ["narratives or anecdotes shared — these are the best content candidates"],
  "strong_opinions": ["convictions stated forcefully enough to be essays or posts"],

  "topics": ["all topics discussed"],
  "key_quotes": ["up to 7 verbatim quotes that are insightful, memorable, or shareable"],

  "pii_detected": [
    {"type": "credit_card|ssn|phone|address|password|email|financial_account|other", "description": "what was found (NOT the actual data)", "approximate_location": "around X:XX mark"}
  ],
  "contains_sensitive_content": false,
  "redacted_sections": ["descriptions of sensitive content that was excluded from all other fields"]
}

CATEGORIES: work, personal, ideas, health, relationships, projects, learning, goals, reflection, creative, business, tech, finance, productivity, identity, spirituality, entertainment.

GUIDELINES:
- Be thorough. Extract MORE than you think is needed. False negatives (missing something) are worse than false positives.
- For questions: capture "I wonder...", "what if...", "should I...", "how do I..." — these reveal what the person is actually thinking about.
- For commitments: "I'm gonna...", "I should...", "I need to..." — these are accountability signals.
- For values: what makes them angry, excited, passionate? What do they keep coming back to?
- For stories_told: if they tell an anecdote or narrative, capture the gist. These are their natural content.
- For strong_opinions: "I think X is wrong", "the problem with Y", "people don't understand Z" — essay-worthy takes.
- Leave arrays empty [] if nothing fits. Don't fabricate.
- NEVER put actual PII in any field except as a redacted description in pii_detected.

Return ONLY the JSON object. No markdown, no code fences, no explanation.`

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

    const userPrompt = `Here is the transcript from my video recording. Please analyze it thoroughly:\n\n${upload.transcript}`

    if (openaiKey) {
      const openai = new OpenAI({ apiKey: openaiKey.key })
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 8192,
      })
      analysisText = completion.choices[0].message.content || ''
      modelUsed = 'gpt-4o'
    } else if (anthropicKey) {
      const anthropic = new Anthropic({ apiKey: anthropicKey.key })
      const message = await anthropic.messages.create({
        model: 'claude-3-7-sonnet-20250219',
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

    // Also run PII scrub on the raw transcript as a safety net
    const scrubbedTranscript = scrubPiiFromTranscript(upload.transcript)

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

    // Generate post suggestions from expanded analysis
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

    // If PII was scrubbed, save the clean transcript
    if (scrubbedTranscript !== upload.transcript) {
      updateData.transcript = scrubbedTranscript
    }

    if (admin) {
      await admin
        .from('video_uploads')
        .update(updateData)
        .eq('id', video_upload_id)

      // Upsert entities from analysis
      await upsertEntities(admin, session.user.id, video_upload_id, analysis)
    }

    finalStatus = 'success'
    finalMeta = {
      ...finalMeta,
      model: modelUsed,
      categories_count: analysis.categories?.length || 0,
      ideas_count: analysis.ideas?.length || 0,
      projects_count: analysis.projects?.length || 0,
      questions_count: analysis.questions?.length || 0,
      people_count: analysis.people_mentioned?.length || 0,
      pii_found: analysis.pii_detected?.length || 0,
      clips_count: generatedClips.length,
      posts_count: generatedPosts.length,
    }

    return NextResponse.json({
      id: video_upload_id,
      analysis,
      generated_clips: generatedClips,
      generated_posts: generatedPosts,
      tags: uniqueTags,
      pii_warning: (analysis.pii_detected?.length || 0) > 0,
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

// ============================================================
// PII Scrubbing — regex-based safety net on raw transcript
// ============================================================

function scrubPiiFromTranscript(text: string): string {
  let scrubbed = text

  // Credit card numbers (13-19 digit sequences with optional separators)
  scrubbed = scrubbed.replace(/\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{1,7}\b/g, '[REDACTED_CARD]')

  // SSN patterns (XXX-XX-XXXX)
  scrubbed = scrubbed.replace(/\b\d{3}[\s\-]\d{2}[\s\-]\d{4}\b/g, '[REDACTED_SSN]')

  // Phone numbers (various US formats)
  scrubbed = scrubbed.replace(/\b(?:\+?1[\s\-]?)?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{4}\b/g, (match) => {
    // Keep if it looks like a year or simple number
    const digits = match.replace(/\D/g, '')
    if (digits.length < 10) return match
    return '[REDACTED_PHONE]'
  })

  // Email addresses
  scrubbed = scrubbed.replace(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Z|a-z]{2,}\b/g, '[REDACTED_EMAIL]')

  return scrubbed
}

// ============================================================
// Entity Accumulation — upsert entities from analysis
// ============================================================

async function upsertEntities(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  videoUploadId: string,
  analysis: any,
) {
  if (!admin) return

  const now = new Date().toISOString()

  const entitiesToUpsert: Array<{
    type: string
    name: string
    context: string
    sentiment?: string
    metadata?: Record<string, any>
  }> = []

  // Projects
  if (analysis.projects) {
    for (const p of analysis.projects) {
      entitiesToUpsert.push({
        type: 'project',
        name: p.name,
        context: p.updates?.join('. ') || `Mentioned as ${p.status}`,
        metadata: { status: p.status },
      })
    }
  }

  // Ideas (only high-confidence ones)
  if (analysis.ideas) {
    for (const idea of analysis.ideas) {
      if (typeof idea === 'object' && idea.confidence >= 0.6) {
        entitiesToUpsert.push({
          type: 'idea',
          name: idea.text.length > 100 ? idea.text.substring(0, 97) + '...' : idea.text,
          context: idea.text,
          metadata: { idea_type: idea.type, confidence: idea.confidence },
        })
      }
    }
  }

  // People
  if (analysis.people_mentioned) {
    for (const person of analysis.people_mentioned) {
      entitiesToUpsert.push({
        type: 'person',
        name: person.name,
        context: person.context,
        metadata: { relationship: person.relationship },
      })
    }
  }

  // Goals
  if (analysis.goals) {
    for (const g of analysis.goals) {
      entitiesToUpsert.push({
        type: 'goal',
        name: g.goal.length > 100 ? g.goal.substring(0, 97) + '...' : g.goal,
        context: g.goal,
        metadata: { timeframe: g.timeframe },
      })
    }
  }

  // Questions
  if (analysis.questions) {
    for (const q of analysis.questions) {
      entitiesToUpsert.push({
        type: 'question',
        name: q.length > 100 ? q.substring(0, 97) + '...' : q,
        context: q,
      })
    }
  }

  // Habits
  if (analysis.habits) {
    for (const h of analysis.habits) {
      entitiesToUpsert.push({
        type: 'habit',
        name: h.habit,
        context: h.habit,
        sentiment: h.sentiment,
      })
    }
  }

  // Commitments
  if (analysis.commitments) {
    for (const c of analysis.commitments) {
      entitiesToUpsert.push({
        type: 'commitment',
        name: c.length > 100 ? c.substring(0, 97) + '...' : c,
        context: c,
      })
    }
  }

  // Skills
  if (analysis.skills_mentioned) {
    for (const s of analysis.skills_mentioned) {
      entitiesToUpsert.push({
        type: 'skill',
        name: s,
        context: `Mentioned skill: ${s}`,
      })
    }
  }

  // Blockers
  if (analysis.blockers) {
    for (const b of analysis.blockers) {
      entitiesToUpsert.push({
        type: 'blocker',
        name: b.length > 100 ? b.substring(0, 97) + '...' : b,
        context: b,
      })
    }
  }

  // Process each entity
  for (const entity of entitiesToUpsert) {
    try {
      const slug = slugify(entity.name)

      // Try to find existing entity
      const { data: existing } = await admin
        .from('entities')
        .select('id, mention_count')
        .eq('user_id', userId)
        .eq('type', entity.type)
        .eq('slug', slug)
        .maybeSingle()

      let entityId: string

      if (existing) {
        // Update existing entity
        entityId = existing.id
        await admin
          .from('entities')
          .update({
            last_mentioned_at: now,
            mention_count: existing.mention_count + 1,
            metadata: entity.metadata || {},
            updated_at: now,
          })
          .eq('id', entityId)
      } else {
        // Create new entity
        const { data: created } = await admin
          .from('entities')
          .insert({
            user_id: userId,
            type: entity.type,
            name: entity.name,
            slug,
            status: entity.type === 'project' ? (entity.metadata?.status || 'active') : null,
            first_mentioned_at: now,
            last_mentioned_at: now,
            mention_count: 1,
            metadata: entity.metadata || {},
          })
          .select('id')
          .single()

        if (!created) continue
        entityId = created.id
      }

      // Record the mention
      await admin
        .from('entity_mentions')
        .insert({
          entity_id: entityId,
          video_upload_id: videoUploadId,
          context: entity.context,
          sentiment: entity.sentiment || null,
        })
    } catch (err) {
      // Don't fail the whole analysis for entity issues
      console.error(`Failed to upsert entity ${entity.type}:${entity.name}:`, err)
    }
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 80)
    .replace(/^-|-$/g, '')
}

// ============================================================
// Clip & Post Generation
// ============================================================

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

  for (const quote of keyQuotes.slice(0, 7)) {
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

  // Daily log
  if (analysis.summary) {
    posts.push({
      title: `Daily Log: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
      content: analysis.summary,
      type: 'log',
    })
  }

  // Ideas
  if (analysis.ideas?.length > 0) {
    for (const idea of analysis.ideas.slice(0, 3)) {
      const text = typeof idea === 'object' ? idea.text : idea
      posts.push({
        title: text.length > 80 ? text.substring(0, 77) + '...' : text,
        content: text,
        type: 'idea',
      })
    }
  }

  // Strong opinions → opinion posts
  if (analysis.strong_opinions?.length > 0) {
    for (const opinion of analysis.strong_opinions.slice(0, 2)) {
      posts.push({
        title: opinion.length > 80 ? opinion.substring(0, 77) + '...' : opinion,
        content: opinion,
        type: 'opinion',
      })
    }
  }

  // Questions → thought-provoking posts
  if (analysis.questions?.length > 0) {
    for (const q of analysis.questions.slice(0, 2)) {
      posts.push({
        title: q.length > 80 ? q.substring(0, 77) + '...' : q,
        content: q,
        type: 'question',
      })
    }
  }

  // Lessons learned → reflection posts
  if (analysis.lessons_learned?.length > 0) {
    for (const lesson of analysis.lessons_learned.slice(0, 2)) {
      posts.push({
        title: lesson.length > 80 ? lesson.substring(0, 77) + '...' : lesson,
        content: lesson,
        type: 'lesson',
      })
    }
  }

  // Project updates
  if (analysis.projects?.length > 0) {
    for (const project of analysis.projects.slice(0, 2)) {
      if (project.updates?.length > 0) {
        posts.push({
          title: `Project Update: ${project.name}`,
          content: project.updates.join('\n'),
          type: 'project_update',
        })
      }
    }
  }

  return posts
}
