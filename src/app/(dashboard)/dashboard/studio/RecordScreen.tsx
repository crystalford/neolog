'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const C = {
  bg:           '#070706',
  bgSurface:    '#0e0d0b',
  bgRaised:     '#141210',
  border:       '#1e1b16',
  borderBright: '#2c2820',
  amber:        '#C8902A',
  amberDim:     '#7a5618',
  amberBright:  '#E8A840',
  amberGlow:    'rgba(200,144,42,0.09)',
  textPrimary:  '#EDE3CC',
  textSecond:   '#9A8E78',
  textDim:      '#5A5040',
  textDimmer:   '#2e2820',
  green:        '#4A8A60',
  red:          '#8A4040',
}

type SegmentAsset = {
  id: string
  segment_order: number
  segment_type: string
  narration: string
  planned_duration_seconds: number | null
  status: string
}

type RecordScreenProps = {
  productionId: string
  userId: string
  onComplete: () => void
  onPause: () => void
}

export function RecordScreen({ productionId, userId, onComplete, onPause }: RecordScreenProps) {
  const supabase = createClient()

  const [segments, setSegments] = useState<SegmentAsset[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [phase, setPhase] = useState<'loading' | 'ready' | 'recording' | 'uploading' | 'done' | 'error'>('loading')
  const [elapsed, setElapsed] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const chunksRef = useRef<Blob[]>([])
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const rafRef = useRef<number | null>(null)

  // Load segments on mount
  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('segment_assets')
        .select('id, segment_order, segment_type, narration, planned_duration_seconds, status')
        .eq('production_id', productionId)
        .order('segment_order')

      if (error || !data?.length) {
        setError('Could not load script segments.')
        setPhase('error')
        return
      }

      setSegments(data as SegmentAsset[])

      // Find first unrecorded segment
      const firstPending = data.findIndex(s => s.status !== 'recorded')
      setCurrentIdx(firstPending >= 0 ? firstPending : 0)
      setPhase('ready')
    }
    load()

    return () => {
      stopEverything()
    }
  }, [productionId])

  const stopEverything = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
    audioCtxRef.current?.close()
  }

  const drawWaveform = () => {
    const canvas = canvasRef.current
    const analyser = analyserRef.current
    if (!canvas || !analyser) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const data = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(data)

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const barCount = 40
    const barWidth = canvas.width / barCount
    const step = Math.floor(data.length / barCount)

    for (let i = 0; i < barCount; i++) {
      const value = data[i * step] / 255
      const height = Math.max(2, value * canvas.height)
      ctx.fillStyle = `rgba(200, 144, 42, ${0.3 + value * 0.7})`
      ctx.fillRect(i * barWidth + 1, canvas.height - height, barWidth - 2, height)
    }

    rafRef.current = requestAnimationFrame(drawWaveform)
  }

  const startRecording = async () => {
    setError(null)
    chunksRef.current = []
    setElapsed(0)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Web Audio waveform
      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser
      drawWaveform()

      // MediaRecorder
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.start(100)
      mediaRecorderRef.current = recorder

      // Elapsed timer
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)

      setPhase('recording')
    } catch (e: any) {
      setError(e.message ?? 'Microphone access denied')
      setPhase('error')
    }
  }

  const stopRecording = (): Promise<Blob> => {
    return new Promise(resolve => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
      audioCtxRef.current?.close()

      const recorder = mediaRecorderRef.current
      if (!recorder || recorder.state === 'inactive') {
        resolve(new Blob(chunksRef.current, { type: 'audio/webm' }))
        return
      }
      recorder.onstop = () => {
        resolve(new Blob(chunksRef.current, { type: 'audio/webm' }))
      }
      recorder.stop()
    })
  }

  const handleNext = async () => {
    setPhase('uploading')
    const blob = await stopRecording()

    const seg = segments[currentIdx]
    const path = `recordings/${userId}/${productionId}/${seg.segment_order}.webm`

    const { error: uploadErr } = await supabase.storage
      .from('videos')
      .upload(path, blob, { upsert: true, contentType: 'audio/webm' })

    if (uploadErr) {
      setError(`Upload failed: ${uploadErr.message}`)
      setPhase('error')
      return
    }

    await supabase.from('segment_assets').update({
      voiceover_r2_key: path,
      status: 'recorded',
      actual_duration_seconds: elapsed,
    }).eq('id', seg.id)

    // Update local state
    setSegments(prev => prev.map((s, i) =>
      i === currentIdx ? { ...s, status: 'recorded' } : s
    ))

    const nextIdx = currentIdx + 1

    if (nextIdx >= segments.length) {
      // All done — trigger assembly
      try {
        await fetch('/api/studio/assemble-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ production_id: productionId }),
        })
      } catch { /* non-blocking — assembly will be triggered */ }
      setPhase('done')
      onComplete()
    } else {
      setCurrentIdx(nextIdx)
      setPhase('ready')
    }
  }

  const handleRetake = async () => {
    await stopRecording()
    chunksRef.current = []
    setElapsed(0)
    setPhase('ready')
  }

  const handlePause = async () => {
    await stopRecording()
    onPause()
  }

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  if (phase === 'loading') {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textDimmer, fontSize: 10, letterSpacing: 2 }}>
        LOADING SCRIPT…
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <div style={{ fontSize: 11, color: C.red }}>{error}</div>
        <button
          onClick={() => { setError(null); setPhase('ready') }}
          style={{ background: 'none', border: `1px solid ${C.borderBright}`, color: C.textDim, fontSize: 10, letterSpacing: 2, padding: '8px 18px', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace" }}
        >
          TRY AGAIN
        </button>
      </div>
    )
  }

  const seg = segments[currentIdx]
  const nextSeg = segments[currentIdx + 1] ?? null
  const recordedCount = segments.filter(s => s.status === 'recorded').length

  return (
    <div style={{
      height: '100%', background: C.bg,
      display: 'flex', flexDirection: 'column',
      fontFamily: "'JetBrains Mono', monospace",
      position: 'relative',
    }}>

      {/* Top bar: REC indicator + cue */}
      <div style={{
        padding: '16px 28px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {phase === 'recording' && (
            <span style={{
              display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
              background: '#CC4444', animation: 'pulse 1s ease-in-out infinite',
            }} />
          )}
          <span style={{ fontSize: 10, letterSpacing: 2, color: phase === 'recording' ? '#CC4444' : C.textDimmer }}>
            {phase === 'recording' ? `REC  ${fmtTime(elapsed)}` : phase === 'uploading' ? 'UPLOADING…' : 'READY'}
          </span>
        </div>
        <div style={{ fontSize: 9, letterSpacing: 2, color: C.amber, textTransform: 'uppercase' }}>
          {seg?.segment_type ?? ''}
        </div>
        <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 1 }}>
          {currentIdx + 1} / {segments.length}
        </div>
      </div>

      {/* Main: narration text */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 60px', textAlign: 'center',
      }}>
        <div style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: 'clamp(20px, 3vw, 32px)',
          fontWeight: 700,
          color: C.textPrimary,
          lineHeight: 1.5,
          maxWidth: 720,
        }}>
          {seg?.narration ?? ''}
        </div>
      </div>

      {/* Next beat preview */}
      <div style={{
        padding: '0 60px 16px', textAlign: 'center', flexShrink: 0,
        borderTop: `1px solid ${C.border}`, paddingTop: 14,
      }}>
        {nextSeg ? (
          <div style={{ fontSize: 11, color: C.textDim, fontStyle: 'italic', lineHeight: 1.5 }}>
            Next: "{nextSeg.narration.slice(0, 90)}{nextSeg.narration.length > 90 ? '…' : ''}"
          </div>
        ) : (
          <div style={{ fontSize: 9, color: C.textDimmer, letterSpacing: 1 }}>
            FINAL SEGMENT
          </div>
        )}
      </div>

      {/* Progress dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 5, padding: '10px 28px', flexShrink: 0 }}>
        {segments.map((s, i) => (
          <div key={s.id} style={{
            width: i === currentIdx ? 10 : 7,
            height: i === currentIdx ? 10 : 7,
            borderRadius: '50%',
            background: s.status === 'recorded' ? C.green
              : i === currentIdx ? C.amber
              : C.textDimmer,
            transition: 'all 0.15s',
            animation: i === currentIdx && phase === 'recording' ? 'pulse 1.5s ease-in-out infinite' : 'none',
          }} />
        ))}
      </div>

      {/* Controls */}
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 12,
        padding: '12px 28px 14px', flexShrink: 0,
      }}>
        {phase === 'ready' && (
          <>
            <button
              onClick={handlePause}
              style={{ background: 'none', border: `1px solid ${C.borderBright}`, color: C.textDim, fontSize: 10, letterSpacing: 2, padding: '9px 20px', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace" }}
            >
              ‖ PAUSE
            </button>
            <button
              onClick={startRecording}
              style={{ background: C.amber, border: `1px solid ${C.amber}`, color: C.bg, fontSize: 11, letterSpacing: 2, fontWeight: 700, padding: '9px 32px', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace" }}
            >
              ● RECORD
            </button>
          </>
        )}
        {phase === 'recording' && (
          <>
            <button
              onClick={handleRetake}
              style={{ background: 'none', border: `1px solid ${C.borderBright}`, color: C.textDim, fontSize: 10, letterSpacing: 2, padding: '9px 20px', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace" }}
            >
              ↩ RETAKE
            </button>
            <button
              onClick={handleNext}
              style={{ background: C.green, border: `1px solid ${C.green}`, color: '#fff', fontSize: 11, letterSpacing: 2, fontWeight: 700, padding: '9px 32px', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace" }}
            >
              ✓ NEXT →
            </button>
            <button
              onClick={handlePause}
              style={{ background: 'none', border: `1px solid ${C.borderBright}`, color: C.textDim, fontSize: 10, letterSpacing: 2, padding: '9px 20px', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace" }}
            >
              ‖ PAUSE
            </button>
          </>
        )}
        {phase === 'uploading' && (
          <div style={{ fontSize: 10, color: C.amber, letterSpacing: 2 }}>SAVING TAKE…</div>
        )}
      </div>

      {/* Waveform canvas */}
      <canvas
        ref={canvasRef}
        width={600}
        height={36}
        style={{
          width: '100%', height: 36, flexShrink: 0,
          opacity: phase === 'recording' ? 1 : 0.15,
          transition: 'opacity 0.3s',
        }}
      />
    </div>
  )
}
