/**
 * States — reference page showing empty / loading / error states for every
 * surface. Useful during design + when testing edge cases.
 */
export const runtime = 'edge'

export default function StatesPage() {
  return (
    <main>
      <section className="hero">
        <div className="crumb reveal d2">Reference</div>
        <h1 className="reveal d3">States</h1>
        <p className="lead reveal d4">Empty / loading / error references for every Timeline surface. Use this to design new card types.</p>
      </section>

      <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 32 }}>
        <Block label="Empty Timeline">
          <div className="empty-row">
            <h3>Nothing here yet</h3>
            <p>Tap Record or Upload below to drop in your first vlog.</p>
          </div>
        </Block>

        <Block label="Loading">
          <div className="empty-row">
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: 2, color: 'var(--bone-3)' }}>LOADING…</p>
          </div>
        </Block>

        <Block label="Error">
          <div className="error-row">Error: HTTP 500 — sample error message</div>
        </Block>

        <Block label="Surfaced · Cluster ready">
          <div className="tcard surfaced has-topic" style={{ ['--topic' as any]: 'var(--t-terra)', margin: '0 16px' }}>
            <div className="t-meta">
              <span className="type-tag">Surfaced</span>
              <span className="sep">·</span>
              <span className="status">Cluster ready</span>
            </div>
            <div className="surfaced-body">
              <span className="surfaced-ico"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" /><path d="M8 5 L8 8 L10.5 9.5" /></svg></span>
              <div className="surfaced-text">Sample <strong>cluster ready</strong> surfaced card. Click to materialize.</div>
            </div>
          </div>
        </Block>
      </div>
    </main>
  )
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="kicker" style={{ padding: '0 24px 12px' }}>{label}</div>
      {children}
    </div>
  )
}
