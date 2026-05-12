/**
 * Public landing — neolog.ai/
 *
 * The marketing/identity page. Bone/ink/Geist, rotating logo, the pitch from
 * NEOLOG.md condensed. Once Cloudflare Access is configured to exclude `/`
 * this becomes the truly-public face; until then, authed visitors still pass
 * through this on their way to /timeline.
 *
 * Note: this page lives OUTSIDE the (app) route group so it doesn't render
 * the dock + capture FAB.
 */
import { Logo } from '@/components/Logo'

export const runtime = 'edge'

export default function LandingPage() {
  return (
    <div className="landing">
      <header className="head">
        <a href="/" className="logo">
          <Logo size={32} />
          <span className="wordmark">neolog</span>
        </a>
        <h1 className="reveal d2">A personal graph of how you think — owned by you, made out of how you talk.</h1>
        <p className="lead reveal d3">
          Record yourself thinking. Neolog transcribes every vlog, refracts it into threads,
          watches for the same idea coming back from different angles, and surfaces what's
          worth materializing into an article, a video essay, an X post, or a clip.
        </p>
        <div className="cta-row reveal d4">
          <a href="/timeline" className="cta">Open Neolog →</a>
          <a href="#how" className="cta subtle">How it works</a>
        </div>
      </header>

      <section className="reveal d5" id="how" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="section-label">How it works</div>
        <div className="grid">
          <div className="cell">
            <span className="num">01</span>
            <span className="title">Capture</span>
            <span className="desc">Drop in a vlog. Phone, mic, whatever you talk into. Neolog handles the rest.</span>
          </div>
          <div className="cell">
            <span className="num">02</span>
            <span className="title">Refract</span>
            <span className="desc">Three extraction passes pull threads, clip-worthy moments, and creative material out of every transcript.</span>
          </div>
          <div className="cell">
            <span className="num">03</span>
            <span className="title">Cluster</span>
            <span className="desc">When the same idea shows up from different angles, the system spots the riff and surfaces it.</span>
          </div>
          <div className="cell">
            <span className="num">04</span>
            <span className="title">Materialize</span>
            <span className="desc">A ripe cluster becomes an article, a video essay, an X thread, a clip — driven from one substrate.</span>
          </div>
        </div>
      </section>

      <section className="reveal d6" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="section-label">The substrate</div>
        <p style={{ color: 'var(--bone-2)', fontSize: 14, lineHeight: 1.6, maxWidth: 580 }}>
          Everything you capture accumulates into one structured representation of yourself —
          owned by you, exportable, complete. The graph isn't a feature, it's the foundation.
        </p>
        <div className="palette-strip" aria-hidden>
          <div className="sw" style={{ background: '#d18847' }} />
          <div className="sw" style={{ background: '#c66042' }} />
          <div className="sw" style={{ background: '#b48b3c' }} />
          <div className="sw" style={{ background: '#b56676' }} />
          <div className="sw" style={{ background: '#8662a8' }} />
          <div className="sw" style={{ background: '#6e6cb8' }} />
          <div className="sw" style={{ background: '#4d8aa8' }} />
          <div className="sw" style={{ background: '#4d9988' }} />
          <div className="sw" style={{ background: '#7a9a6a' }} />
          <div className="sw" style={{ background: '#5e7d5e' }} />
        </div>
      </section>

      <footer>
        <span>Neolog · personal life graph</span>
        <span>v2 · {new Date().getFullYear()}</span>
      </footer>
    </div>
  )
}
