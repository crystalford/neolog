/**
 * Inngest function: trigger-voice-clone
 *
 * Triggered when voice corpus reaches 180+ minutes of archived audio.
 * Submits top voice samples to ElevenLabs Professional Voice Clone API.
 * Polls for training completion and stores the resulting model ID.
 */

import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProviderKeyWithClient } from '@/lib/ai-provider'

type VoiceThresholdEvent = {
  name: 'manifest/voice-threshold-met'
  data: {
    user_id: string
  }
}

const SAMPLE_LIMIT = 25 // Top N voice samples by fidelity
const POLL_INTERVAL_MS = 30_000
const MAX_POLL_ATTEMPTS = 20

export const triggerVoiceClone = inngest.createFunction(
  {
    id: 'trigger-voice-clone',
    name: 'Trigger ElevenLabs Voice Clone',
    retries: 0, // Don't auto-retry — training jobs shouldn't be duplicated
    timeouts: { finish: '15m' },
  },
  { event: 'manifest/voice-threshold-met' },
  async ({ event, step }) => {
    const { user_id } = event.data

    const admin = createAdminClient()
    if (!admin) throw new Error('Admin client not available')

    // ── Step 1: Select top voice samples ──
    const samples = await step.run('select-voice-samples', async () => {
      const { data } = await admin
        .from('neural_corpus')
        .select('id, storage_path, fidelity_score, meta')
        .eq('user_id', user_id)
        .eq('type', 'voice')
        .order('fidelity_score', { ascending: false })
        .limit(SAMPLE_LIMIT)

      if (!data || data.length === 0) {
        throw new Error('No voice samples found in corpus')
      }

      return data
    })

    // ── Step 2: Get ElevenLabs API key ──
    const elevenLabsKey = await step.run('get-elevenlabs-key', async () => {
      const result = await resolveProviderKeyWithClient(admin, user_id, 'elevenlabs')
      if (!result) throw new Error('No ElevenLabs API key configured — add one in Settings')
      return result.key
    })

    // ── Step 3: Submit voice clone job to ElevenLabs ──
    const voiceId = await step.run('submit-voice-clone', async () => {
      const formData = new FormData()
      formData.append('name', `neolog-voice-${user_id.slice(0, 8)}`)
      formData.append('description', 'AI voice clone created by Neolog')

      // Generate signed download URLs for each sample
      for (const sample of samples) {
        const { data: signedData } = await admin.storage
          .from('videos')
          .createSignedUrl(sample.storage_path, 3600)

        if (!signedData?.signedUrl) continue

        // Download the audio file
        const res = await fetch(signedData.signedUrl)
        if (!res.ok) continue

        const blob = await res.blob()
        const fileName = sample.storage_path.split('/').pop() || 'sample.wav'
        formData.append('files', blob, fileName)
      }

      // Submit to ElevenLabs PVC
      const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
        method: 'POST',
        headers: { 'xi-api-key': elevenLabsKey },
        body: formData,
      })

      if (!response.ok) {
        const err = await response.text()
        throw new Error(`ElevenLabs API error: ${response.status} — ${err}`)
      }

      const result = await response.json()
      if (!result.voice_id) throw new Error('ElevenLabs did not return a voice_id')

      return result.voice_id as string
    })

    // ── Step 4: Store voice model ID ──
    await step.run('store-voice-model', async () => {
      await admin
        .from('manifest_training_state')
        .upsert({
          user_id,
          voice_clone_model_id: voiceId,
          voice_clone_status: 'ready',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
    })

    return { status: 'ready', voice_id: voiceId }
  },
)
