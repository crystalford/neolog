/**
 * Shared logic for video upload analysis.
 * Used by both /api/video-upload/analyze and /api/video-upload/process
 */

import { createAdminClient } from '@/lib/supabase/admin'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'

export const ANALYSIS_PROMPT_VERSION = '1.5'

export const ANALYSIS_SYSTEM_PROMPT = `You are a comprehensive personal intelligence analyst for the Neolog platform. You analyze raw, unedited transcripts from {userName} — stream-of-consciousness recordings, voice memos, chat sessions, or text notes about {userName}'s life, work, ideas, and projects.
 
 Your job is to extract EVERYTHING meaningful. Think of yourself as building a living map of {userName}'s mind, work, and life over time. Every session adds to an accumulating graph — entity framing you capture now will be compared against future sessions to detect how thinking evolves. 
 
 IDENTITY GUIDELINE: You MUST refer to {userName} by name (e.g., "{userName} is struggling with...") in the third person. UNDER NO CIRCUMSTANCES should you use generic terms like "the person", "the user", "the speaker", or "the individual". You must also avoid using "you" to refer to {userName} in the summary or reflections. This is an intelligence platform; your analysis must be an objective but familiar third-person record of {userName}'s state.
 
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
   "analysis_version": "1.5",
   "title": "A tight, sophisticated title (5-8 words) that captures the narrative essence and psychological core of the session. Avoid generic titles. No 'I' — use noun-phrase or imperative form (e.g. 'Building the Neolog clip pipeline', 'Planning the Super Bass album structure').",
   "key_win": "Single most significant thing that happened, was figured out, or decided in this session. 1 punchy sentence. This is the pull-quote for the session. If nothing was truly won, use the most important topic covered. No 'I' — write as a noun-phrase or statement (e.g. 'Resolved the clip assembly ordering bug', 'Committed to hard-cuts-only editing approach').",
   "summary": "2-3 sentence summary of what was discussed, in third person about {userName}.",
   "summary_first_person": "2-3 sentences in first person starting with 'I'. What did I work on, figure out, or decide? (e.g. 'I spent this session working through the clip assembly pipeline and landed on a hard-cuts-only approach...')",
   "emotional_arc": "How did the energy or emotional state shift across the session? 1 sentence capturing the trajectory, not just the endpoint. (e.g. 'Started scattered and avoidant, but worked through the friction and ended focused with a clear next step.', 'Consistently energized throughout — this was a high-output session.')",
   "categories": [{"name": "category", "confidence": 0.0-1.0}],
   "mood": "overall emotional tone (energized, reflective, frustrated, excited, anxious, calm, scattered, focused, etc.)",
   "energy_level": "high" | "medium" | "low",
   "reflections": {
     "observation": "What the AI noticed about this session — a pattern, contradiction, or insight that {userName} may not have explicitly stated. 2-3 sentences. Third person about {userName}.",
     "challenge": "One specific question or reframe to push {userName}'s thinking forward. Should be slightly uncomfortable — the thing they're avoiding or haven't considered. Start with 'What if...' or 'Have you considered...' or a direct question.",
     "encouragement": "One grounding, affirming statement that is specific to this session — not generic. Reference what they actually said or did. Direct address to {userName}."
   },
   "rewrite": "A polished, first-person rewrite of everything {userName} said. Write exactly as if {userName} is speaking — same ideas, same sequence, authentic voice — but coherent, well-articulated prose with no rambling. This is what they meant to say. Write in first person ('I think...', 'I've been...', 'My plan is...'). Match the length of the original — don't summarize, rewrite.",

   "ideas": [
     {"text": "the idea", "type": "business|creative|product|content|philosophical|other", "confidence": 0.0-1.0}
   ],
   "questions": ["unanswered questions, wonderings, 'what if' moments — these are gold"],
   "recurring_themes": ["themes that come up multiple times in this recording"],

   "projects": [
     {
       "name": "project name — use the most specific/canonical name mentioned (not 'the app' when a real name was used)",
       "status": "active|idea|stalled|completed|mentioned",
       "updates": ["what was said about it"],
       "framing": "1 sentence: how {userName} is currently relating to this project — their energy, attitude, or emotional position toward it",
       "project_type": "tech|book|creative|business|personal|other",
       "full_context": "Comprehensive 2-3 paragraph synthesis of EVERYTHING discussed about this project in this recording. Include technical decisions, plans, problems, ideas, breakthroughs, frustrations — capture the full discourse even if the project name was only mentioned once at the start and then discussed at length without repeating the name. Write it as a session journal entry for this project, in third person about {userName}."
     }
   ],
   "action_items": [
     {"task": "specific, concrete next step — actionable verb + what", "context": "why this matters or what triggered it — 1 sentence", "urgency": "now|soon|someday"}
   ],
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
   "values_expressed": ["principles, beliefs, things that clearly matter to {userName}"],
 
   "people_mentioned": [
     {"name": "name", "context": "2-3 sentences of what was actually said about this person — what did {userName} discuss, think, or say about them? Capture the substance of the discussion, not just a description of who they are. Include why they came up and what was said in this specific recording.", "relationship": "collaborator|friend|family|influence|acquaintance|other|null"}
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
 
   "tools_mentioned": [
     {"name": "tool or software name", "context": "how or why they are using it"}
   ],
   "principles": ["articulated rules or frameworks stated explicitly — 'I never X', 'My approach is always Y', 'The rule I follow is Z'"],

   "health_mentions": {
     "sleep": "any sleep mention, e.g. '6 hours', 'slept great', 'insomnia' — null if none",
     "energy": "1-10 numeric estimate based on what they say about energy/fatigue — null if not mentioned",
     "workout": "any exercise or physical activity mentioned — null if none",
     "body_notes": "any mention of weight changes, physical health, diet, illness — null if none"
   },

   "topics": ["all topics discussed"],
   "key_quotes": ["up to 7 verbatim quotes that are insightful, memorable, or shareable"],
 
   "pii_detected": [
     {"type": "credit_card|ssn|phone|address|password|email|financial_account|other", "description": "what was found (NOT the actual data)", "approximate_location": "around X:XX mark"}
   ],
   "contains_sensitive_content": false,
   "redacted_sections": ["descriptions of sensitive content that was excluded from all other fields"]
 }
 
 CATEGORIES: work, personal, ideas, health, relationships, projects, learning, goals, reflection, creative, business, tech, finance, productivity, identity, spirituality, entertainment.
  
 LEARNING CATEGORIES: If the standard categories above do not fully capture the essence of a realization or topic, you MUST suggest up to 3 NEW, highly descriptive categories in the "categories" array. These should be insightful tags like "existential-friction", "strategic-pivot", "creative-block", etc.
 
 GUIDELINES:
 - Be thorough. Extract MORE than you think is needed. False negatives (missing something) are worse than false positives.
 - For projects: only mark as 'active' if {userName} is actively working on it NOW. Use 'mentioned' for passing references. Use the most specific, canonical name (if they say both 'the YouTube tool' and a specific product name, use the product name). For full_context: if {userName} spends 10 minutes discussing a project but only says its name once, the full_context should capture all 10 minutes of discussion — not just the one sentence with the name. project_type should be 'tech' for software/engineering projects, 'book' for books/memoirs/biographies, 'creative' for art/music/film, 'business' for companies/ventures, 'personal' for personal goals/life projects, 'other' for anything else.
 - For entity deduplication: if the same concept appears under multiple names in this session, consolidate to the most specific/canonical name used.
 - For framing: capture {userName}'s current emotional and strategic relationship to a project — not just what they said, but how they're sitting with it. "Excited and building fast" differs from "stuck and avoiding it."
 - For questions: capture "I wonder...", "what if...", "should I...", "how do I..." — these reveal what {userName} is actually thinking about.
 - For commitments: "I'm gonna...", "I should...", "I need to..." — these are accountability signals.
 - For values: what makes them angry, excited, passionate? What do they keep coming back to?
 - For stories_told: if they tell an anecdote or narrative, capture the gist. These are their natural content.
 - For strong_opinions: "I think X is wrong", "the problem with Y", "people don't understand Z" — essay-worthy takes.
 - Leave arrays empty [] if nothing fits. Don't fabricate.
 - NEVER put actual PII in any field except as a redacted description in pii_detected.
 
 Return ONLY the JSON object. No markdown, no code fences, no explanation.`

/**
 * Run AI analysis on a transcript, returning the parsed analysis object.
 */
export async function runAnalysis(
  transcript: string,
  openaiKey: string | null,
  anthropicKey: string | null,
  userName: string = 'the user',
): Promise<{ analysis: any; modelUsed: string }> {
  const systemPrompt = ANALYSIS_SYSTEM_PROMPT.replace(/{userName}/g, userName)
  const userPrompt = `Here is the transcript from ${userName}'s recording. Please analyze it thoroughly:\n\n${transcript}`

  let analysisText = ''
  let modelUsed = ''

  if (anthropicKey) {
    const anthropic = new Anthropic({ apiKey: anthropicKey })
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.3,
    })
    const textContent = message.content.find(c => c.type === 'text')
    if (textContent && textContent.type === 'text') {
      analysisText = textContent.text
    }
    modelUsed = 'claude-sonnet-4-5'
  } else if (openaiKey) {
    const openai = new OpenAI({ apiKey: openaiKey })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })
    analysisText = completion.choices[0].message.content || ''
    modelUsed = 'gpt-4o'
  } else {
    throw new Error('No API keys provided for analysis')
  }

  const cleaned = analysisText
    .replace(/^```json\s*/, '')
    .replace(/\s*```$/, '')
    .trim()
  const analysis = JSON.parse(cleaned)

  return { analysis, modelUsed }
}

/**
 * Regex-based PII scrubbing as a safety net on raw transcript text.
 */
export function scrubPiiFromTranscript(text: string): string {
  let scrubbed = text

  // Credit card numbers
  scrubbed = scrubbed.replace(/\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{1,7}\b/g, '[REDACTED_CARD]')

  // SSN patterns
  scrubbed = scrubbed.replace(/\b\d{3}[\s\-]\d{2}[\s\-]\d{4}\b/g, '[REDACTED_SSN]')

  // Phone numbers (10+ digits)
  scrubbed = scrubbed.replace(/\b(?:\+?1[\s\-]?)?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{4}\b/g, (match) => {
    const digits = match.replace(/\D/g, '')
    if (digits.length < 10) return match
    return '[REDACTED_PHONE]'
  })

  // Email addresses
  scrubbed = scrubbed.replace(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Z|a-z]{2,}\b/g, '[REDACTED_EMAIL]')

  return scrubbed
}

/**
 * Extract tags from analysis categories and topics.
 */
export function extractTags(analysis: any): string[] {
  const tags = [
    ...(analysis.categories?.map((c: any) => c.name) || []),
    ...(analysis.topics || []),
  ].filter(Boolean).map((t: string) => t.toLowerCase())
  return [...new Set(tags)]
}

/**
 * Generate clip suggestions from key quotes matched to transcript segments.
 */
export function generateClipSuggestions(
  segments: Array<{ start: number; end: number; text: string }>,
  keyQuotes: string[],
) {
  if (!segments.length || !keyQuotes.length) return []

  const clips: Array<{ start: number; end: number; title: string; transcript: string; platform: string }> = []

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
          title: quote,
          transcript: clipTranscript,
          platform: 'general',
        })
        break
      }
    }
  }

  return clips
}

/**
 * Generate post suggestions from analysis.
 */
export function generatePostSuggestions(analysis: any, recordedAt?: string | Date | null) {
  const posts: Array<{ title: string; content: string; type: string }> = []

  // Strong opinions — forceful takes that stand alone as X posts
  if (analysis.strong_opinions?.length > 0) {
    for (const opinion of analysis.strong_opinions.slice(0, 3)) {
      if (!opinion) continue
      posts.push({ title: opinion, content: opinion, type: 'opinion' })
    }
  }

  // Key quotes — verbatim memorable lines from the transcript
  if (analysis.key_quotes?.length > 0) {
    for (const quote of analysis.key_quotes.slice(0, 4)) {
      if (!quote) continue
      posts.push({ title: quote, content: quote, type: 'quote' })
    }
  }

  return posts
}

type EntitySource =
  | { videoUploadId: string; logEntryId?: never }
  | { logEntryId: string; videoUploadId?: never }

/**
 * Upsert entities from analysis into the entities + entity_mentions tables.
 * source: either { videoUploadId } for video pipeline or { logEntryId } for chat/capture/import.
 */
export async function upsertEntities(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  userId: string,
  source: EntitySource,
  analysis: any,
) {
  const mentionSourceFields =
    'videoUploadId' in source
      ? { video_upload_id: source.videoUploadId, source_type: 'video' as const }
      : { log_entry_id: source.logEntryId, source_type: 'capture' as const }
  const now = new Date().toISOString()

  const entitiesToUpsert: Array<{
    type: string
    name: string
    context: string
    full_context?: string | null
    sentiment?: string
    metadata?: Record<string, any>
  }> = []

  if (analysis.projects) {
    for (const p of analysis.projects) {
      entitiesToUpsert.push({
        type: 'project',
        name: p.name,
        context: p.framing || p.updates?.join('. ') || `Mentioned as ${p.status}`,
        full_context: p.full_context || null,
        metadata: { status: p.status, project_type: p.project_type || 'other' },
      })
    }
  }

  // Ideas — high-confidence only (≥0.7), full text stored
  if (analysis.ideas) {
    for (const idea of analysis.ideas) {
      if (typeof idea === 'object' && idea.confidence >= 0.7) {
        entitiesToUpsert.push({
          type: 'idea',
          name: idea.text,
          context: idea.text,
          metadata: { idea_type: idea.type, confidence: idea.confidence },
        })
      }
    }
  }

  if (analysis.people_mentioned) {
    for (const person of analysis.people_mentioned) {
      if (!person.name) continue
      entitiesToUpsert.push({
        type: 'person',
        name: person.name,
        context: person.context,
        metadata: { relationship: person.relationship },
      })
    }
  }

  if (analysis.goals) {
    for (const g of analysis.goals) {
      if (!g.goal) continue
      entitiesToUpsert.push({
        type: 'goal',
        name: g.goal,
        context: g.goal,
        metadata: { timeframe: g.timeframe },
      })
    }
  }

  // ── Core entity types ────────────────────────────────────────────────────

  if (analysis.decisions) {
    for (const d of analysis.decisions) {
      const name = typeof d === 'object' ? d.decision : d
      const reasoning = typeof d === 'object' ? d.reasoning : null
      if (!name) continue
      entitiesToUpsert.push({
        type: 'decision',
        name,
        context: reasoning ? `${name} — ${reasoning}` : name,
        metadata: reasoning ? { reasoning } : {},
      })
    }
  }

  if (analysis.values_expressed) {
    for (const v of analysis.values_expressed) {
      if (!v) continue
      entitiesToUpsert.push({
        type: 'value',
        name: v,
        context: v,
      })
    }
  }

  // Principles → stored as 'value' entities (explicitly articulated rules/frameworks)
  if (analysis.principles) {
    for (const p of analysis.principles) {
      if (!p) continue
      entitiesToUpsert.push({
        type: 'value',
        name: p,
        context: p,
        metadata: { source: 'principle' },
      })
    }
  }

  // Lessons learned → 'insight' entities (accumulate into a personal knowledge base)
  if (analysis.lessons_learned) {
    for (const lesson of analysis.lessons_learned) {
      if (!lesson) continue
      entitiesToUpsert.push({
        type: 'insight',
        name: lesson,
        context: lesson,
      })
    }
  }

  // Tools mentioned → 'tool' entities (track usage context over time)
  if (analysis.tools_mentioned) {
    for (const t of analysis.tools_mentioned) {
      const name = typeof t === 'object' ? t.name : t
      const context = typeof t === 'object' ? t.context : t
      if (!name) continue
      entitiesToUpsert.push({
        type: 'tool',
        name,
        context: context || name,
      })
    }
  }

  for (const entity of entitiesToUpsert) {
    try {
      const slug = slugify(entity.name)

      const { data: existing } = await admin
        .from('entities')
        .select('id, mention_count')
        .eq('user_id', userId)
        .eq('type', entity.type)
        .eq('slug', slug)
        .maybeSingle()

      let entityId: string

      if (existing) {
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

      await admin
        .from('entity_mentions')
        .insert({
          entity_id: entityId,
          ...mentionSourceFields,
          context: entity.context,
          full_context: entity.full_context || null,
          sentiment: entity.sentiment || null,
        })
    } catch (err) {
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
