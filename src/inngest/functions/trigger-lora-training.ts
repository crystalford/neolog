/**
 * Inngest function: trigger-lora-training
 *
 * Triggered when face corpus reaches 25+ qualified frames (fidelity >= 0.6).
 * Submits top face samples to fal.ai FLUX LoRA fast training.
 * Polls for completion and stores the resulting model URL.
 */

import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'

type FaceThresholdEvent = {
  name: 'manifest/face-threshold-met'
  data: {
    user_id: string
  }
}

const FRAME_LIMIT = 40  // Use up to 40 best frames
const FIDELITY_MINIMUM = 0.6
const FAL_API_BASE = 'https://queue.fal.run'

export const triggerLoraTraining = inngest.createFunction(
  {
    id: 'trigger-lora-training',
    name: 'Trigger fal.ai FLUX LoRA Training',
    retries: 0, // Don't auto-retry — training jobs shouldn't be duplicated
    timeouts: { finish: '30m' },
  },
  { event: 'manifest/face-threshold-met' },
  async ({ event, step }) => {
    const { user_id } = event.data

    const admin = createAdminClient()
    if (!admin) throw new Error('Admin client not available')

    const falKey = process.env.FALAI_API_KEY
    if (!falKey) throw new Error('FALAI_API_KEY not configured')

    // ── Step 1: Select top qualifying face frames ──
    const frames = await step.run('select-face-frames', async () => {
      const { data } = await admin
        .from('neural_corpus')
        .select('id, storage_path, fidelity_score')
        .eq('user_id', user_id)
        .eq('type', 'face')
        .gte('fidelity_score', FIDELITY_MINIMUM)
        .order('fidelity_score', { ascending: false })
        .limit(FRAME_LIMIT)

      if (!data || data.length === 0) {
        throw new Error('No qualifying face frames found')
      }

      return data
    })

    // ── Step 2: Generate signed image URLs ──
    const imageUrls = await step.run('generate-image-urls', async () => {
      const urls: string[] = []

      for (const frame of frames) {
        const { data: signedData } = await admin.storage
          .from('videos')
          .createSignedUrl(frame.storage_path, 7200)

        if (signedData?.signedUrl) {
          urls.push(signedData.signedUrl)
        }
      }

      if (urls.length === 0) throw new Error('Could not generate signed URLs for face frames')
      return urls
    })

    // ── Step 3: Submit LoRA training job to fal.ai ──
    const requestId = await step.run('submit-lora-training', async () => {
      const response = await fetch(`${FAL_API_BASE}/fal-ai/flux-lora-fast-training`, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${falKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          images_data_url: imageUrls,
          trigger_word: 'NEOLOG_SUBJECT',
          steps: 1000,
          learning_rate: 0.0004,
          rank: 16,
          is_input_format_already_preprocessed: false,
        }),
      })

      if (!response.ok) {
        const err = await response.text()
        throw new Error(`fal.ai API error: ${response.status} — ${err}`)
      }

      const result = await response.json()
      if (!result.request_id) throw new Error('fal.ai did not return a request_id')

      return result.request_id as string
    })

    // ── Step 4: Poll for completion ──
    const loraModelUrl = await step.run('poll-for-completion', async () => {
      const maxAttempts = 40
      const delayMs = 30_000

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, delayMs))
        }

        const statusRes = await fetch(
          `${FAL_API_BASE}/fal-ai/flux-lora-fast-training/requests/${requestId}/status`,
          {
            headers: { 'Authorization': `Key ${falKey}` },
          }
        )

        if (!statusRes.ok) continue

        const status = await statusRes.json()

        if (status.status === 'COMPLETED') {
          // Fetch the result
          const resultRes = await fetch(
            `${FAL_API_BASE}/fal-ai/flux-lora-fast-training/requests/${requestId}`,
            {
              headers: { 'Authorization': `Key ${falKey}` },
            }
          )
          if (!resultRes.ok) throw new Error('Failed to fetch LoRA result')
          const result = await resultRes.json()
          return result.diffusers_lora_file?.url || result.config_file?.url || requestId
        }

        if (status.status === 'FAILED') {
          throw new Error(`LoRA training failed: ${status.error || 'unknown error'}`)
        }
      }

      throw new Error('LoRA training timed out after polling')
    })

    // ── Step 5: Store LoRA model URL ──
    await step.run('store-lora-model', async () => {
      await admin
        .from('manifest_training_state')
        .upsert({
          user_id,
          lora_model_id: loraModelUrl,
          lora_status: 'ready',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
    })

    return { status: 'ready', lora_model_url: loraModelUrl }
  },
)
