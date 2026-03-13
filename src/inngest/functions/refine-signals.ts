import { createAdminClient } from '@/lib/supabase/admin'
import { inngest } from '@/inngest/client'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'
import OpenAI from 'openai'

export const refineSignal = inngest.createFunction(
  { id: 'refine-signal' },
  { event: 'neural/refine-signal' },
  async ({ event, step }) => {
    const { signalId, userId, type, url } = event.data
    const admin = createAdminClient()

    if (!admin) {
      console.error('Failed to create admin client')
      return { status: 'error', error: 'admin_client_failed' }
    }

    if (type === 'image') {
      const grading = await step.run('grade-image-quality', async () => {
        const openaiKeyRes = await resolveProviderKeyWithClient(admin, userId, 'openai')
        if (!openaiKeyRes?.key) {
          throw new Error('No OpenAI key found for vision grading')
        }

        const openai = new OpenAI({ apiKey: openaiKeyRes.key })
        
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "You are an expert AI training data curator. Your job is to analyze a headshot and determine if it is suitable for LORA (Low-Rank Adaptation) training for a virtual character avatar."
            },
            {
              role: "user",
              content: [
                { 
                  type: "text", 
                  text: "Analyze this image for: 1. Lighting (Is it balanced?), 2. Clarity (Is it sharp?), 3. Focus (Is the face clear and centered?), 4. Background (Is it clean or too busy?). Return a JSON object with 'score' (0.0-1.0) and 'is_training_ready' (boolean). Provide brief 'critique' string." 
                },
                {
                  type: "image_url",
                  image_url: {
                    "url": url,
                  },
                },
              ],
            },
          ],
          response_format: { type: "json_object" }
        })

        const result = JSON.parse(response.choices[0].message.content || '{}')
        return result
      })

      await step.run('update-signal-record', async () => {
        await admin
          .from('neural_signals')
          .update({
            quality_score: grading.score,
            is_training_ready: grading.is_training_ready,
            metadata: {
              critique: grading.critique,
              refined_at: new Date().toISOString()
            }
          })
          .eq('id', signalId)
      })

      return { status: 'refined', type: 'image', score: grading.score }
    }

    return { status: 'skipped', reason: 'type_not_handled' }
  }
)
