'use client'

export const runtime = 'edge'

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
  blue:         '#4870A8',
  red:          '#8A4040',
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, letterSpacing: 3, color: C.amberDim, textTransform: 'uppercase', marginBottom: 10 }}>
      {children}
    </div>
  )
}

function Btn({ children, onClick, primary, small, disabled }: {
  children: React.ReactNode
  onClick?: () => void
  primary?: boolean
  small?: boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: primary ? C.amber : 'none',
        border: `1px solid ${primary ? C.amber : C.borderBright}`,
        color: primary ? C.bg : C.textSecond,
        fontSize: small ? 9 : 10, letterSpacing: 2, fontWeight: primary ? 700 : 400,
        padding: small ? '4px 10px' : '8px 18px',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: "'JetBrains Mono', monospace",
        transition: 'all 0.12s', whiteSpace: 'nowrap' as const,
      }}
    >
      {children}
    </button>
  )
}

type Photo = {
  id: string
  storage_path: string
  thumbnail_url: string | null
  created_at: string
  fidelity_score: number | null
}

type TrainingState = {
  lora_status: string | null
  lora_model_id: string | null
  voice_clone_status: string | null
  voice_clone_model_id: string | null
}

export default function CharacterPage() {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [photos, setPhotos] = useState<Photo[]>([])
  const [training, setTraining] = useState<TrainingState | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [triggerStatus, setTriggerStatus] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setUserId(session.user.id)

      const [photosRes, trainingRes] = await Promise.all([
        supabase
          .from('neural_corpus')
          .select('id, storage_path, meta, fidelity_score, created_at')
          .eq('user_id', session.user.id)
          .eq('type', 'face')
          .order('created_at', { ascending: false })
          .limit(24),
        supabase
          .from('manifest_training_state')
          .select('lora_status, lora_model_id, voice_clone_status, voice_clone_model_id')
          .eq('user_id', session.user.id)
          .single(),
      ])

      const photoData: Photo[] = (photosRes.data ?? []).map((p: any) => ({
        id: p.id,
        storage_path: p.storage_path,
        thumbnail_url: p.meta?.thumbnail_url ?? null,
        created_at: p.created_at,
        fidelity_score: p.fidelity_score,
      }))

      setPhotos(photoData)
      setTraining(trainingRes.data ?? null)
      setLoading(false)
    }
    load()
  }, [])

  const handleFiles = async (files: FileList | null) => {
    if (!files || !userId) return
    setUploading(true)
    setUploadProgress(0)

    const accepted = Array.from(files).filter(f => f.type.startsWith('image/'))
    let done = 0

    for (const file of accepted) {
      const path = `${userId}/portraits/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`

      const { error } = await supabase.storage
        .from('character-photos')
        .upload(path, file, { upsert: false })

      if (!error) {
        // Register in neural_corpus
        await supabase.from('neural_corpus').insert({
          user_id: userId,
          type: 'face',
          storage_path: path,
          fidelity_score: null,
          meta: { original_name: file.name, size: file.size },
        })
      }

      done++
      setUploadProgress(Math.round((done / accepted.length) * 100))
    }

    // Refresh photos
    const { data } = await supabase
      .from('neural_corpus')
      .select('id, storage_path, meta, fidelity_score, created_at')
      .eq('user_id', userId)
      .eq('type', 'face')
      .order('created_at', { ascending: false })
      .limit(24)

    setPhotos((data ?? []).map((p: any) => ({
      id: p.id,
      storage_path: p.storage_path,
      thumbnail_url: p.meta?.thumbnail_url ?? null,
      created_at: p.created_at,
      fidelity_score: p.fidelity_score,
    })))

    setUploading(false)
    setUploadProgress(0)
  }

  const handleTriggerLoRA = async () => {
    setTriggerStatus('triggering')
    try {
      const res = await fetch('/api/character/trigger-lora', { method: 'POST' })
      const data = await res.json()
      setTriggerStatus(res.ok ? 'queued' : (data.error ?? 'error'))
    } catch {
      setTriggerStatus('error')
    }
    setTimeout(() => setTriggerStatus(null), 6000)
  }

  const handleDeletePhoto = async (id: string, storagePath: string) => {
    await Promise.all([
      supabase.from('neural_corpus').delete().eq('id', id),
      supabase.storage.from('character-photos').remove([storagePath]),
    ])
    setPhotos(prev => prev.filter(p => p.id !== id))
  }

  const loraReady = photos.length >= 15
  const loraStatus = training?.lora_status ?? null
  const loraModelId = training?.lora_model_id ?? null

  return (
    <div style={{ height: '100vh', overflowY: 'auto', fontFamily: "'JetBrains Mono', monospace" }}>
      {/* Header */}
      <div style={{ padding: '24px 40px 20px', borderBottom: `1px solid ${C.border}`, background: C.bgSurface }}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, color: C.textPrimary, marginBottom: 4 }}>
          Character
        </div>
        <div style={{ fontSize: 11, color: C.textSecond }}>
          Portrait corpus for AI image generation. Upload photos → train LoRA → generate.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 0 }}>
        {/* Left: photo grid */}
        <div style={{ padding: '24px 32px 40px' }}>

          {/* Upload zone */}
          <div
            onClick={() => !uploading && fileRef.current?.click()}
            style={{
              border: `1px dashed ${uploading ? C.amber : C.borderBright}`,
              padding: '20px 24px',
              display: 'flex', alignItems: 'center', gap: 18,
              background: uploading ? C.amberGlow : 'none',
              cursor: uploading ? 'default' : 'pointer',
              marginBottom: 24, transition: 'all 0.12s',
            }}
            onMouseEnter={e => { if (!uploading) (e.currentTarget as HTMLElement).style.borderColor = C.amber }}
            onMouseLeave={e => { if (!uploading) (e.currentTarget as HTMLElement).style.borderColor = C.borderBright }}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={e => handleFiles(e.target.files)}
            />
            <div style={{ fontSize: 22, color: C.textDim }}>+</div>
            <div>
              <div style={{ fontSize: 12, color: C.textSecond, marginBottom: 3 }}>
                {uploading ? `Uploading… ${uploadProgress}%` : 'Upload portrait photos'}
              </div>
              <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 1 }}>
                JPG · PNG · HEIC · 15+ photos recommended · clear face, varied lighting
              </div>
            </div>
            {uploading && (
              <div style={{ marginLeft: 'auto', width: 80, height: 2, background: C.bgRaised, borderRadius: 1 }}>
                <div style={{ height: '100%', width: `${uploadProgress}%`, background: C.amber, borderRadius: 1, transition: 'width 0.3s' }} />
              </div>
            )}
          </div>

          {/* Photo grid */}
          <Label>PORTRAIT CORPUS — {photos.length} PHOTOS</Label>
          {loading ? (
            <div style={{ fontSize: 10, color: C.textDimmer, letterSpacing: 2 }}>LOADING…</div>
          ) : photos.length === 0 ? (
            <div style={{ fontSize: 11, color: C.textDimmer, padding: '20px 0' }}>
              No photos yet. Upload portraits to start building your corpus.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 4 }}>
              {photos.map(photo => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  onDelete={() => handleDeletePhoto(photo.id, photo.storage_path)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right: training panel */}
        <div style={{ padding: '24px 20px 40px', borderLeft: `1px solid ${C.border}` }}>

          {/* Progress to training */}
          <div style={{ marginBottom: 28 }}>
            <Label>PORTRAIT CORPUS</Label>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
              <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 1 }}>
                {photos.length} / 15 min
              </div>
              <div style={{ fontSize: 9, color: loraReady ? C.green : C.amber, letterSpacing: 1 }}>
                {loraReady ? 'READY' : `${15 - photos.length} more needed`}
              </div>
            </div>
            <div style={{ height: 3, background: C.bgRaised, borderRadius: 2 }}>
              <div style={{
                height: '100%', width: `${Math.min(100, (photos.length / 15) * 100)}%`,
                background: loraReady ? C.green : C.amber,
                borderRadius: 2, transition: 'width 0.3s',
              }} />
            </div>
          </div>

          {/* LoRA status */}
          <div style={{ marginBottom: 24 }}>
            <Label>LORA STATUS</Label>
            {loraModelId ? (
              <div style={{ padding: '10px 13px', border: `1px solid ${C.green}30`, background: `${C.green}10`, marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: C.green, letterSpacing: 2, marginBottom: 4 }}>MODEL READY</div>
                <div style={{ fontSize: 9, color: C.textDim, wordBreak: 'break-all' as const }}>{loraModelId}</div>
              </div>
            ) : loraStatus ? (
              <div style={{ padding: '10px 13px', border: `1px solid ${C.amberDim}`, background: C.amberGlow, marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: C.amber, letterSpacing: 2 }}>{loraStatus.toUpperCase()}</div>
              </div>
            ) : (
              <div style={{ fontSize: 10, color: C.textDimmer, marginBottom: 12 }}>No LoRA model yet.</div>
            )}

            {triggerStatus && (
              <div style={{ fontSize: 9, color: triggerStatus === 'queued' ? C.green : C.red, letterSpacing: 1, marginBottom: 10 }}>
                {triggerStatus === 'queued' ? '✓ Training queued — check back in 30–60 min' : triggerStatus}
              </div>
            )}

            <Btn
              primary={loraReady}
              disabled={!loraReady || triggerStatus === 'triggering'}
              onClick={handleTriggerLoRA}
            >
              {loraModelId ? 'RETRAIN LORA →' : 'TRAIN LORA →'}
            </Btn>
          </div>

          {/* Info */}
          <div style={{ padding: '12px 14px', border: `1px solid ${C.border}`, background: C.bgSurface }}>
            <div style={{ fontSize: 9, color: C.amberDim, letterSpacing: 2, marginBottom: 8 }}>HOW IT WORKS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                '01  Upload 15+ portrait photos',
                '02  Train LoRA on Replicate (~30 min)',
                '03  Generate AI portraits in Studio',
              ].map(s => (
                <div key={s} style={{ fontSize: 9, color: C.textDim, letterSpacing: 0.5 }}>{s}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PhotoCard({ photo, onDelete }: { photo: Photo; onDelete: () => void }) {
  const supabase = createClient()
  const [hovered, setHovered] = useState(false)
  const [imgUrl, setImgUrl] = useState<string | null>(photo.thumbnail_url)

  useEffect(() => {
    if (imgUrl) return
    async function getUrl() {
      const { data } = await supabase.storage
        .from('character-photos')
        .createSignedUrl(photo.storage_path, 300)
      if (data?.signedUrl) setImgUrl(data.signedUrl)
    }
    getUrl()
  }, [photo.storage_path])

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: 'relative', aspectRatio: '1', background: C.bgRaised, border: `1px solid ${C.border}`, overflow: 'hidden' }}
    >
      {imgUrl ? (
        <img src={imgUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: C.textDimmer }}>
          ◈
        </div>
      )}
      {photo.fidelity_score !== null && (
        <div style={{
          position: 'absolute', bottom: 4, left: 4,
          fontSize: 7, color: C.textPrimary, background: 'rgba(0,0,0,0.7)', padding: '1px 4px',
          letterSpacing: 0.5,
        }}>
          {Math.round((photo.fidelity_score ?? 0) * 100)}%
        </div>
      )}
      {hovered && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          style={{
            position: 'absolute', top: 4, right: 4,
            background: 'rgba(0,0,0,0.75)', border: 'none',
            color: '#fff', cursor: 'pointer', fontSize: 11, padding: '2px 6px',
          }}
        >
          ✕
        </button>
      )}
    </div>
  )
}
