/**
 * Read a vlog's pipeline_events stream and produce a single human-readable
 * diagnosis. NOT raw log text — actual synthesis: status + reason + what to do.
 *
 * Called from:
 *   - GET /api/v2/vlogs/[id]/events    (shown as banner at top of detail page)
 *   - GET /api/v2/admin/pipeline-state (aggregated across corpus for bulk view)
 *
 * Output examples:
 *   { status: 'healthy', label: 'Running normally' }
 *   { status: 'queued',  label: 'Waiting at FFmpeg gate (12 vlogs ahead)' }
 *   { status: 'broken_input', label: 'FFmpeg cannot read this file (tried 5 codecs)',
 *     recommendation: 'Replace the file or accept as broken — the input is likely corrupt' }
 *   { status: 'whisper_stuck', label: 'Whisper has retried 14 times with no progress',
 *     recommendation: 'Wait 10 min then reset; likely a Workers AI rate-limit window' }
 *   { status: 'code_reset', label: 'Reset by a code deployment',
 *     recommendation: 'Auto-retrying; should resume on its own' }
 */

import type { D1Database } from '@cloudflare/workers-types'
import { getEventsForVlog } from './pipeline-events'

export type DiagnosisStatus =
  | 'healthy'           // running normally, no issue
  | 'queued'            // waiting at a gate / not started yet
  | 'in_flight'         // actively processing
  | 'complete'          // done, has data
  | 'b_roll'            // done, empty extraction (silent / no-dialogue footage)
  | 'broken_input'      // FFmpeg can't read this file across all strategies
  | 'whisper_stuck'     // Whisper retrying many times, no progress
  | 'whisper_timeout'   // single Whisper call timed out
  | 'ffmpeg_overloaded' // gate backed up, transient
  | 'code_reset'        // DO/workflow killed by deploy, will auto-retry
  | 'network_lost'      // transient connection failure between services
  | 'restart_limit'     // healer gave up (MAX_RESTARTS reached)
  | 'short_transcript'  // transcript < 20 chars; treated as b-roll
  | 'unknown'           // couldn't classify

export interface Diagnosis {
  status: DiagnosisStatus
  label: string
  recommendation?: string
  /** Recent retry / restart count we observed, when relevant. */
  attempts?: number
  /** Latest event timestamp ms, for "stuck since X" displays. */
  last_activity_ts?: number | null
}

interface EventRow {
  step: string
  sub_step: string | null
  status: string
  started_at: string
  error_full_text: string | null
  detail_json: string | null
}

/**
 * Synthesize a diagnosis from a vlog's pipeline_events stream + its current
 * pipeline_status. Caller passes both because pipeline_status is the
 * authoritative terminal state (complete / failed / archived).
 */
export function diagnoseFromEvents(
  events: EventRow[],
  pipelineStatus: string,
  hasActiveExtraction: boolean,
  totalExtractedItems: number,
  transcriptLen: number,
): Diagnosis {
  // Terminal happy states first
  if (pipelineStatus === 'complete' && hasActiveExtraction && totalExtractedItems > 0) {
    return { status: 'complete', label: `Extracted ${totalExtractedItems} item${totalExtractedItems === 1 ? '' : 's'}` }
  }
  if (pipelineStatus === 'complete' && (transcriptLen < 200) && totalExtractedItems === 0) {
    return {
      status: 'b_roll',
      label: 'No extractable dialogue (b-roll)',
      recommendation: 'Treat as cinematic footage. Nothing to extract.',
    }
  }
  if (pipelineStatus === 'complete') {
    return { status: 'complete', label: 'Pipeline finished' }
  }

  // Look at recent events to figure out what's happening NOW
  // events come in oldest-first or newest-first depending on caller —
  // normalize by sorting newest-last
  const sorted = [...events].sort((a, b) =>
    new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
  )
  const recent = sorted.slice(-30)
  const errors = sorted.filter(e => e.status === 'failed' || e.status === 'failed_terminal')

  // Specific failure-mode detection (most specific first):

  // Restart limit (healer gave up)
  if (errors.some(e => /auto-restart limit reached/i.test(e.error_full_text || ''))) {
    return {
      status: 'restart_limit',
      label: 'Healer gave up after several restarts',
      recommendation: 'Click "Reset failed + restart counter" in the bulk modal, then re-run.',
      attempts: errors.length,
    }
  }

  // FFmpeg "5 strategies failed" — input is unreadable
  if (errors.some(e => /failed across \d+ strategies/i.test(e.error_full_text || ''))) {
    return {
      status: 'broken_input',
      label: 'FFmpeg cannot read this file (tried 5 codec strategies)',
      recommendation: 'The video is likely corrupt or uses an unsupported codec. Replace the file, or accept as broken.',
      attempts: errors.length,
    }
  }

  // FFmpeg single-strategy failure with exit 234 + only build banner — input issue
  const ffmpegExitErrors = errors.filter(e => {
    const text = e.error_full_text || ''
    return /ffmpeg exit \d+/i.test(text) &&
      /configuration:/i.test(text) &&
      !/Input #/i.test(text)
  })
  if (ffmpegExitErrors.length >= 2) {
    return {
      status: 'broken_input',
      label: 'FFmpeg exits before reading the input (cryptic exit 234)',
      recommendation: 'The input is unreadable. Pipeline DO retries already happen; if this is the 3rd repeat, the file is broken.',
      attempts: ffmpegExitErrors.length,
    }
  }

  // Code reset from deploy
  if (errors.some(e => /durable object reset.*code was updated/i.test(e.error_full_text || ''))) {
    const codeResets = errors.filter(e => /code was updated/i.test(e.error_full_text || '')).length
    return {
      status: 'code_reset',
      label: `Reset by ${codeResets} code deployment${codeResets === 1 ? '' : 's'}`,
      recommendation: 'Auto-retrying after each reset. Should resume once deploys settle.',
      attempts: codeResets,
    }
  }

  // Network connection lost between services
  if (errors.some(e => /network connection lost|operation was aborted/i.test(e.error_full_text || ''))) {
    return {
      status: 'network_lost',
      label: 'Transient network failure between services',
      recommendation: 'Auto-retries with backoff. Usually self-heals within 1-2 retries.',
      attempts: errors.length,
    }
  }

  // Whisper retried many times with no progress
  const whisperStarts = sorted.filter(e =>
    e.step === 'transcribe' && e.sub_step === 'whisper_call' && e.status === 'started'
  )
  const whisperOks = sorted.filter(e =>
    e.step === 'transcribe' && e.sub_step === 'whisper_call' && e.status === 'ok'
  )
  if (whisperStarts.length >= 5 && whisperOks.length === 0) {
    return {
      status: 'whisper_stuck',
      label: `Whisper retried ${whisperStarts.length} times with no progress`,
      recommendation: 'Likely a Workers AI rate-limit / capacity window. Wait ~10 min then click Reset on the vlog page.',
      attempts: whisperStarts.length,
    }
  }

  // FFmpeg gate backup (long wait_ms)
  const recentGate = recent.filter(e =>
    e.step === 'audio_extract' && e.sub_step === 'ffmpeg_gate_acquired'
  ).pop()
  if (recentGate && recentGate.detail_json) {
    try {
      const detail = JSON.parse(recentGate.detail_json)
      if (typeof detail.waiting === 'number' && detail.waiting > 5) {
        return {
          status: 'ffmpeg_overloaded',
          label: `Queued at the FFmpeg gate (${detail.waiting} vlogs ahead, ${detail.in_flight} running)`,
          recommendation: 'Throughput-limited, not broken. Will run when its turn comes up.',
        }
      }
    } catch {}
  }

  // Recent transcribe started but no completion → in flight
  const lastTranscribe = sorted.filter(e => e.step === 'transcribe').pop()
  if (lastTranscribe && lastTranscribe.status === 'started' && pipelineStatus === 'transcribing') {
    return { status: 'in_flight', label: 'Transcribing right now (Whisper running)' }
  }

  // Pipeline_status maps
  if (pipelineStatus === 'transcoding' || pipelineStatus === 'extracting' || pipelineStatus === 'transcribing') {
    return { status: 'in_flight', label: `Running: ${pipelineStatus}` }
  }
  if (pipelineStatus === 'uploaded' || pipelineStatus === 'queued') {
    return { status: 'queued', label: 'Waiting to start' }
  }
  if (pipelineStatus === 'archived') {
    return { status: 'queued', label: 'Archived — needs manual re-extract' }
  }
  if (pipelineStatus === 'failed' && errors.length > 0) {
    const lastErr = errors[errors.length - 1].error_full_text || 'unknown'
    return {
      status: 'unknown',
      label: 'Failed — see error log',
      recommendation: `Last error: ${lastErr.slice(0, 200)}`,
      attempts: errors.length,
    }
  }

  return { status: 'unknown', label: `Status: ${pipelineStatus}` }
}

/**
 * Convenience: fetch the events + vlog row and run diagnosis in one call.
 */
export async function diagnoseVlog(
  db: D1Database,
  vlog_id: string,
  operator_id: string,
): Promise<Diagnosis | null> {
  const events = await getEventsForVlog(db, vlog_id, operator_id, 200)
  const row = await db.prepare(
    `SELECT v.pipeline_status, COALESCE(LENGTH(v.transcript_text), 0) AS transcript_len,
            (SELECT total_items FROM extraction_runs r
              WHERE r.vlog_id = v.id AND r.is_active = 1
              LIMIT 1) AS total_items
       FROM vlogs v
      WHERE v.id = ? AND v.operator_id = ?`,
  ).bind(vlog_id, operator_id).first<{
    pipeline_status: string
    transcript_len: number
    total_items: number | null
  }>()
  if (!row) return null
  return diagnoseFromEvents(
    events as any,
    row.pipeline_status,
    row.total_items !== null,
    row.total_items ?? 0,
    row.transcript_len ?? 0,
  )
}
