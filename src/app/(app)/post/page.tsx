/**
 * Post composer — edit and ship a draft X post or thread.
 */
'use client'

import { useState } from 'react'

export default function PostComposerPage() {
  const [kind, setKind] = useState<'x_post' | 'x_thread'>('x_post')
  const [body, setBody] = useState('')
  const max = kind === 'x_post' ? 280 : 280

  return (
    <main>
      <a href="/timeline" className="detail-back">← Timeline</a>
      <div className="detail-stage">
        <section style={{ paddingTop: 24 }}>
          <div className="kicker">Compose</div>
          <h1 style={{ fontWeight: 400, fontSize: 30, letterSpacing: '-0.6px', margin: '8px 0 12px' }}>New post</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={`fchip ${kind === 'x_post' ? 'active' : ''}`} onClick={() => setKind('x_post')}>Single post</button>
            <button className={`fchip ${kind === 'x_thread' ? 'active' : ''}`} onClick={() => setKind('x_thread')}>Thread</button>
          </div>
        </section>

        <div className="section">
          <div className="section-label">Body</div>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value.slice(0, max))}
            placeholder="What's the riff…"
            rows={8}
            style={{
              width: '100%',
              background: 'var(--ink-2)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              padding: 16,
              fontSize: 15,
              lineHeight: 1.55,
              color: 'var(--bone)',
              resize: 'vertical',
            }}
          />
          <div style={{ marginTop: 8, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: 1, color: body.length > max * 0.9 ? 'var(--state-warn)' : 'var(--bone-3)', textAlign: 'right' }}>
            {body.length}/{max}
          </div>
        </div>

        <div className="section" style={{ paddingBottom: 32 }}>
          <button
            disabled={!body.trim()}
            onClick={() => alert('X OAuth + publish endpoint ships once social_integrations table is wired. UI is staged.')}
            style={{
              padding: '12px 24px',
              borderRadius: 100,
              background: body.trim() ? 'var(--bone)' : 'transparent',
              color: body.trim() ? 'var(--ink)' : 'var(--bone-4)',
              border: body.trim() ? 'none' : '1px solid var(--line-warm)',
              fontWeight: 500,
              fontSize: 14,
              cursor: body.trim() ? 'pointer' : 'not-allowed',
            }}>Ship to X →</button>
        </div>
      </div>
    </main>
  )
}
