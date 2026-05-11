export const runtime = 'edge'

import Link from 'next/link'
import { INK, BONE, FONT_BODY, FONT_MONO } from '@/lib/design'

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh', background: INK.bg, color: BONE.bone,
      fontFamily: FONT_BODY, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: 3, color: BONE.bone3, textTransform: 'uppercase', marginBottom: 12 }}>
          404
        </div>
        <p style={{ fontSize: 14, color: BONE.bone1, marginBottom: 20 }}>Not found.</p>
        <Link
          href="/timeline"
          style={{
            fontFamily: FONT_MONO, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase',
            padding: '8px 16px', color: BONE.bone, border: `1px solid ${BONE.bone3}`,
          }}
        >
          Timeline
        </Link>
      </div>
    </div>
  )
}
