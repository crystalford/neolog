/**
 * develop-idea — background content studio engine
 *
 * Triggered automatically after each upload for:
 *   - strong_opinions (forceful takes flagged as essay-worthy)
 *   - high-confidence ideas (confidence >= 0.88)
 *   - key_win (when it reads like a real thesis)
 *
 * Generates a full verbatim video essay script written in the user's
 * extracted voice — ready to read from a teleprompter.
 */

import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

const SCRIPT_SYSTEM_PROMPT = `You are a ghostwriter who has deeply studied how a specific person talks. You write video essay scripts that sound EXACTLY like them — not polished, not like an AI wrote it.

The script will be read verbatim from a teleprompter. It must feel spoken, not written.

RULES:
- Write in first person, in the person's voice
- Use their actual sentence rhythms, phrases, and rhetorical patterns from the voice profile
- Short punchy sentences when they talk that way. Build-ups when they do that
- Include natural pauses (an em dash, or a short sentence on its own)
- No "In this video..." openers. Just dive straight into the hook — the most arresting version of the idea
- No generic YouTube intros or outros. End on the idea, not on a call to subscribe
- The script should feel like they just recorded themselves thinking this through, but the best version of that
- Length: aim for 700-900 words (about 5-7 minutes spoken at a natural pace)
- Structure: hook → build the context → main argument → the specific insight or take → land it

Output ONLY the script text. No stage directions, no section headers, no explanation. Just the words they will say.`

export const developIdea = inngest.createFunction(
  { id: 'develop-idea', concurrency: { limit: 3 } },
  { event: 'neolog/develop-idea' },
  async ({ event, step }) => {
    const { user_id, source_text, source_type, source_upload_ids = [], format = 'video_essay' } = event.data

    const admin = createAdminClient()
    if (!admin) return { status: 'error', error: 'no_admin_client' }

    // ── Step 1: Fetch voice profile + AI keys ──
    const context = await step.run('fetch-context', async () => {
      const [keysRes, profileRes] = await Promise.all([
        Promise.all([
          resolveProviderKeyWithClient(admin, user_id, 'anthropic'),
          resolveProviderKeyWithClient(admin, user_id, 'openai'),
        ]),
        admin.from('profiles').select('display_name, username, voice_profile').eq('id', user_id).single(),
      ])

      const [anthropicKeyRes, openaiKeyRes] = keysRes
      const profile = profileRes.data

      return {
        anthropicKey: anthropicKeyRes?.key || null,
        openaiKey: openaiKeyRes?.key || null,
        voiceProfile: (profile?.voice_profile as Record<string, any> | null) || null,
        userName: profile?.display_name || profile?.username || 'the creator',
      }
    })

    if (!context.anthropicKey && !context.openaiKey) {
      return { status: 'skipped', reason: 'no_api_keys' }
    }

    // ── Step 2: Create draft row in 'generating' state ──
    const draftId = await step.run('create-draft-row', async () => {
      const { data } = await admin.from('content_drafts').insert({
        user_id,
        format,
        title: `Developing: ${source_text.slice(0, 60)}...`,
        body: '',
        status: 'generating',
        source_type,
        source_text,
        source_upload_ids,
      }).select('id').single()
      return data?.id
    })

    if (!draftId) return { status: 'error', error: 'could_not_create_draft_row' }

    // ── Step 3: Generate script ──
    const generated = await step.run('generate-script', async () => {
      const { voiceProfile, userName, anthropicKey, openaiKey } = context

      const voiceSection = voiceProfile ? `
VOICE PROFILE — how ${userName} actually talks:
- Signature phrases they use: ${(voiceProfile.signature_phrases || []).join(', ') || 'none detected yet'}
- Sentence rhythm: ${voiceProfile.sentence_rhythm || 'unknown'}
- Humor style: ${voiceProfile.humor_style || 'unknown'}
- Argument style: ${voiceProfile.argument_style || 'unknown'}
- Rhetorical moves: ${(voiceProfile.rhetorical_moves || []).join(', ') || 'none detected yet'}
- Energy markers / favourite words: ${(voiceProfile.energy_markers || []).join(', ') || 'unknown'}
- Their attitude: ${voiceProfile.attitude || 'unknown'}
- Voice summary: ${voiceProfile.voice_summary || 'no profile built yet'}
- Sessions analysed: ${voiceProfile.upload_count || 1}` : `
VOICE PROFILE — not enough sessions yet to build a full profile. Write in an energetic, direct, authentic voice — spoken word style, first person.`

      const userPrompt = `Write a ${format === 'video_essay' ? 'video essay script' : format === 'article' ? 'article' : 'thread'} expanding on this idea.

SEED IDEA:
"${source_text}"

${voiceSection}

Write the full script now. Remember: verbatim spoken word, ready to read from a teleprompter.`

      let scriptText = ''
      let modelUsed = ''

      if (anthropicKey) {
        const anthropic = new Anthropic({ apiKey: anthropicKey })
        const msg = await anthropic.messages.create({
          model: 'claude-sonnet-4-5',
          max_tokens: 2048,
          system: SCRIPT_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
          temperature: 0.7,
        })
        const t = msg.content.find(c => c.type === 'text')
        if (t && t.type === 'text') scriptText = t.text
        modelUsed = 'claude-sonnet-4-5'
      } else if (openaiKey) {
        const openai = new OpenAI({ apiKey: openaiKey })
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: SCRIPT_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 2048,
        })
        scriptText = completion.choices[0].message.content || ''
        modelUsed = 'gpt-4o'
      }

      // Extract first sentence as hook
      const firstSentenceEnd = scriptText.search(/[.!?](?:\s|$)/)
      const hook = firstSentenceEnd > 0 ? scriptText.slice(0, firstSentenceEnd + 1).trim() : scriptText.slice(0, 120).trim()

      // Derive a title from the first ~10 words after stripping openers
      const cleanedForTitle = scriptText.replace(/^["']/, '').trim()
      const titleWords = cleanedForTitle.split(/\s+/).slice(0, 9).join(' ')
      const title = titleWords.length > 10 ? titleWords + '...' : titleWords

      const wordCount = scriptText.split(/\s+/).filter(Boolean).length
      const estimatedDurationSeconds = Math.round((wordCount / 130) * 60)

      return { scriptText, hook, title, wordCount, estimatedDurationSeconds, modelUsed }
    })

    // ── Step 4: Persist the finished draft ──
    await step.run('save-draft', async () => {
      await admin.from('content_drafts').update({
        title: generated.title,
        hook: generated.hook,
        body: generated.scriptText,
        word_count: generated.wordCount,
        estimated_duration_seconds: generated.estimatedDurationSeconds,
        status: 'draft',
        generation_model: generated.modelUsed,
        updated_at: new Date().toISOString(),
      }).eq('id', draftId)
    })

    return { status: 'success', draft_id: draftId, word_count: generated.wordCount }
  }
)
