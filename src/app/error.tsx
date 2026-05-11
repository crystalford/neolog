'use client'
export const runtime = 'edge'

import { useEffect } from 'react'
import { INK, BONE, STATE, FONT_BODY, FONT_MONO } from '@/lib/design'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <div style={{
      minHeight: '100vh', background: INK.bg, color: BONE.bone,
      fontFamily: FONT_BODY, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{ maxWidth: 480 }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: 3, color: STATE.err, textTransform: 'uppercase', marginBottom: 12 }}>
          Error
        </div>
        <p style={{ fontSize: 14, color: BONE.bone1, marginBottom: 20 }}>{error.message}</p>
        <button
          onClick={reset}
          style={{
            fontFamily: FONT_MONO, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase',
            padding: '8px 16px', background: 'transparent', color: BONE.bone, border: `1px solid ${BONE.bone3}`, cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    </div>
  )
}
