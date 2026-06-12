'use client'

/**
 * Your voice — settings panel for Cloudflare-native TTS.
 *
 * Three modes:
 *   record — the operator records each beat themselves (default)
 *   clone  — MiniMax 2.8 Turbo clones the operator's voice from a 10s sample
 *   preset — Deepgram Aura-2 with one of 40+ preset voices
 *
 * The operator records the cloning sample in this panel via MediaRecorder
 * (same flow as per-beat voiceover recording), uploads base64 to
 * /api/v2/operator/voice-profile, and is then free to use cloning on any
 * future production. Deleting the profile reverts to 'record' mode.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { PRESET_VOICES } from '@/lib/tts'

type Mode = 'record' | 'clone' | 'preset'

interface Profile {
  has_profile: boolean
  voice_synth_mode: Mode
  voice_synth_voice_id: string | null
  sample_url: string | null
}

export function VoicePreferences() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [recording, setRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [savingMode, setSavingMode] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const startedAtRef = useRef<number>(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/v2/operator/voice-profile', { credentials: 'include' })
      if (r.ok) setProfile(await r.json())
    } catch {}
  }, [])
  useEffect(() => { load() }, [load])

  const start = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        stream.getTracks().forEach(t => t.stop())
        if (tickRef.current) clearInterval(tickRef.current)
        setRecording(false)
        await upload(blob)
      }
      recorder.start()
      recorderRef.current = recorder
      startedAtRef.current = Date.now()
      setRecording(true)
      tickRef.current = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 100)
    } catch (e: any) {
      setError(`microphone failed: ${e?.message || e}`)
    }
  }

  const stop = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
  }

  const upload = async (blob: Blob) => {
    setUploading(true)
    setError(null)
    try {
      const buf = await blob.arrayBuffer()
      const bin = new Uint8Array(buf)
      let s = ''
      for (let i = 0; i < bin.length; i += 0x8000) {
        s += String.fromCharCode.apply(null, Array.from(bin.subarray(i, i + 0x8000)) as any)
      }
      const b64 = btoa(s)
      const r = await fetch('/api/v2/operator/voice-profile', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_base64: b64, mime_type: blob.type }),
      })
      const d: any = await r.json()
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      await load()
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setUploading(false)
      setElapsedMs(0)
    }
  }

  const clearProfile = async () => {
    if (!confirm('Delete your voice profile? Synth-clone will revert to preset voices.')) return
    try {
      await fetch('/api/v2/operator/voice-profile', { method: 'DELETE', credentials: 'include' })
      await load()
    } catch {}
  }

  const setMode = async (mode: Mode, voice_id?: string) => {
    setSavingMode(true)
    setError(null)
    try {
      const body: any = { voice_synth_mode: mode }
      if (voice_id) body.voice_synth_voice_id = voice_id
      const r = await fetch('/api/v2/operator/voice-profile', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const d: any = await r.json().catch(() => ({}))
        throw new Error(d?.error || `HTTP ${r.status}`)
      }
      await load()
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setSavingMode(false)
    }
  }

  const seconds = Math.floor(elapsedMs / 1000)
  const mode: Mode = profile?.voice_synth_mode ?? 'record'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.55 }}>
        Pick how voiceover audio is produced for each beat. <strong>Record</strong> uses your browser mic, beat-by-beat. <strong>Synthesize (cloned)</strong> uses Cloudflare MiniMax&nbsp;2.8 Turbo and your 10-second sample to read every beat in your voice. <strong>Synthesize (preset)</strong> uses Cloudflare Deepgram Aura-2 with one of the preset voices.
      </div>

      {/* Mode picker */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <ModeOption
          active={mode === 'record'}
          label="Record yourself"
          sub="MediaRecorder per beat on the production page. Your actual voice."
          onClick={() => setMode('record')}
          saving={savingMode}
        />
        <ModeOption
          active={mode === 'clone'}
          disabled={!profile?.has_profile}
          label="Synthesize (cloned)"
          sub={profile?.has_profile
            ? 'MiniMax 2.8 Turbo reads each beat in your voice from your 10-second sample.'
            : 'Record a 10-second sample below to enable cloning.'}
          onClick={() => setMode('clone')}
          saving={savingMode}
        />
        <ModeOption
          active={mode === 'preset'}
          label="Synthesize (preset)"
          sub="Deepgram Aura-2 reads each beat with a preset voice."
          onClick={() => setMode('preset')}
          saving={savingMode}
        />
      </div>

      {/* Preset voice picker */}
      {mode === 'preset' && (
        <div style={{
          padding: 14, border: '1px solid var(--line-2)', borderRadius: 10,
          background: 'rgba(91, 141, 246, 0.04)',
        }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: 1.6, color: 'var(--fg-3)', marginBottom: 8 }}>
            CHOOSE A VOICE
          </div>
          <select
            value={profile?.voice_synth_voice_id ?? 'asteria'}
            onChange={e => setMode('preset', e.target.value)}
            style={{
              fontSize: 13, padding: '6px 10px', width: '100%',
              background: 'var(--bg-2)', color: 'var(--fg)',
              border: '1px solid var(--line-2)', borderRadius: 6,
            }}
          >
            {PRESET_VOICES.map(v => (
              <option key={v.id} value={v.id}>{v.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Voice profile */}
      <div style={{
        padding: 16, border: '1px solid var(--line-2)', borderRadius: 10,
        background: 'var(--bg-1)', display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg)' }}>Voice sample</div>
          <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginTop: 2 }}>
            Record 10 seconds of yourself talking naturally — anything you like. MiniMax 2.8 Turbo clones from a 5–10 second clip.
          </div>
        </div>

        {profile?.has_profile && profile.sample_url && (
          <audio src={profile.sample_url} controls style={{ width: '100%', height: 32 }}/>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {!recording && !uploading && (
            <button onClick={start} className="canon-btn primary" style={{ fontSize: 12 }}>
              {profile?.has_profile ? 'Replace sample' : 'Record 10 seconds'}
            </button>
          )}
          {recording && (
            <>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--t-terra)',
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--t-terra)', animation: 'pulse 1s infinite' }}/>
                REC · {seconds}s
              </span>
              <button onClick={stop} className="canon-btn ghost" style={{ fontSize: 12 }}>
                Stop
              </button>
            </>
          )}
          {uploading && (
            <span style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'JetBrains Mono, monospace' }}>
              UPLOADING…
            </span>
          )}
          {profile?.has_profile && !recording && !uploading && (
            <button onClick={clearProfile} className="canon-btn ghost"
              style={{ fontSize: 11, color: 'var(--t-terra)' }}>
              Delete sample
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: 'var(--t-terra)', wordBreak: 'break-word' }}>
          {error}
        </div>
      )}
    </div>
  )
}

function ModeOption({ active, disabled, label, sub, onClick, saving }: {
  active: boolean
  disabled?: boolean
  label: string
  sub: string
  onClick: () => void
  saving: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={!!disabled || saving}
      style={{
        textAlign: 'left', padding: '10px 14px',
        background: active ? 'rgba(91, 141, 246, 0.10)' : 'rgba(91, 141, 246, 0.015)',
        border: `1px solid ${active ? 'var(--sig)' : 'var(--line-2)'}`,
        borderRadius: 10, color: 'var(--fg)', cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginTop: 2 }}>{sub}</div>
    </button>
  )
}
