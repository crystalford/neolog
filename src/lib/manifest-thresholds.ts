/**
 * manifest-thresholds.ts
 *
 * Checks whether voice clone or LoRA training thresholds have been reached,
 * and returns flags indicating which triggers should fire.
 *
 * Called from process-upload.ts after each upload completes.
 * Events are dispatched by the caller so that step.sendEvent
 * runs at the correct Inngest step level.
 */

type SupabaseAdminClient = {
  from: (table: string) => any
}

export type ManifestTriggerFlags = {
  triggerVoiceClone: boolean
  triggerLoraTraining: boolean
}

const VOICE_CLONE_MINUTES_THRESHOLD = 180
const LORA_FACE_FRAMES_THRESHOLD = 25
const LORA_FIDELITY_MINIMUM = 0.6

export async function checkManifestThresholds(
  userId: string,
  admin: SupabaseAdminClient,
): Promise<ManifestTriggerFlags> {
  const flags: ManifestTriggerFlags = {
    triggerVoiceClone: false,
    triggerLoraTraining: false,
  }

  // Fetch all voice and face corpus entries
  const { data: corpusEntries } = await admin
    .from('neural_corpus')
    .select('type, fidelity_score, meta')
    .eq('user_id', userId)
    .in('type', ['voice', 'face'])

  if (!corpusEntries || corpusEntries.length === 0) return flags

  // Fetch existing training state (single row per user)
  const { data: trainingState } = await admin
    .from('manifest_training_state')
    .select('voice_clone_triggered_at, lora_triggered_at')
    .eq('user_id', userId)
    .maybeSingle()

  // --- Voice clone threshold ---
  if (!trainingState?.voice_clone_triggered_at) {
    const voiceEntries = corpusEntries.filter((e: any) => e.type === 'voice')
    const totalSeconds = voiceEntries.reduce((sum: number, e: any) => {
      const dur = e.meta?.duration_seconds
      // Fall back to 5-minute estimate per file if duration not recorded
      return sum + (typeof dur === 'number' ? dur : 300)
    }, 0)

    if (totalSeconds / 60 >= VOICE_CLONE_MINUTES_THRESHOLD) {
      flags.triggerVoiceClone = true

      await admin
        .from('manifest_training_state')
        .upsert({
          user_id: userId,
          voice_clone_triggered_at: new Date().toISOString(),
          voice_clone_status: 'queued',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
    }
  }

  // --- LoRA training threshold ---
  if (!trainingState?.lora_triggered_at) {
    const qualifiedFaces = corpusEntries.filter(
      (e: any) => e.type === 'face' && e.fidelity_score >= LORA_FIDELITY_MINIMUM
    )

    if (qualifiedFaces.length >= LORA_FACE_FRAMES_THRESHOLD) {
      flags.triggerLoraTraining = true

      await admin
        .from('manifest_training_state')
        .upsert({
          user_id: userId,
          lora_triggered_at: new Date().toISOString(),
          lora_status: 'queued',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
    }
  }

  return flags
}
