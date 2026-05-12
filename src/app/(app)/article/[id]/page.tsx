/**
 * Article detail — long-form drafting view with sections, threads woven,
 * sources. UI staged until the production engine ships article generation.
 */
'use client'

import { useState } from 'react'

export default function ArticleDetailPage({ params }: { params: { id: string } }) {
  // Placeholder until productions schema is queried
  const [version] = useState('v0.3')
  return (
    <main>
      <a href="/timeline" className="detail-back">← Timeline</a>
      <div className="detail-stage">
        <section style={{ paddingTop: 24 }}>
          <div className="kicker" style={{ marginBottom: 12 }}>Article · Drafting {version}</div>
          <h1 style={{ fontWeight: 400, fontSize: 32, letterSpacing: '-0.7px', lineHeight: 1.15 }}>The For You page does not know you</h1>
        </section>

        <div className="section">
          <div className="section-label">Progress · 62%</div>
          <div className="tcard essay has-topic" style={{ ['--topic' as any]: 'var(--t-terra)' }}>
            <div className="essay-progress" style={{ marginTop: 0 }}>
              <div className="track"><div className="fill" style={{ width: '62%' }} /></div>
              <span className="pct">62%</span>
            </div>
            <div className="essay-stats" style={{ marginTop: 12 }}>
              <span><span className="n">1,248</span> words</span>
              <span><span className="n">7</span> threads woven</span>
              <span><span className="n">3</span> bounce sources</span>
            </div>
          </div>
        </div>

        <div className="section">
          <div className="section-label">Sections</div>
          <ol style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8, counterReset: 'sec' }}>
            {['Premise: what the algorithm trusts', 'Revealed vs stated preference', 'Why subscription is theater', '(Drafting) What good would look like'].map((s, i) => (
              <li key={i} style={{
                counterIncrement: 'sec',
                background: 'var(--ink-2)',
                border: '1px solid var(--line)',
                borderRadius: 12,
                padding: '12px 16px',
                fontSize: 14,
                color: 'var(--bone-1)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--bone-3)', letterSpacing: 1, minWidth: 22 }}>0{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        </div>

        <div className="section" style={{ paddingBottom: 32 }}>
          <button onClick={() => alert('Article editor + Substack publish ships with the production engine.')} style={{ padding: '12px 24px', borderRadius: 100, background: 'var(--bone)', color: 'var(--ink)', fontWeight: 500, fontSize: 14, border: 'none' }}>Open editor →</button>
        </div>
      </div>
    </main>
  )
}
