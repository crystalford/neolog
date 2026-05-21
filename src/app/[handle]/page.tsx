/**
 * Public profile — what visitors see at neolog.ai/{handle}.
 * Sits outside the (app) route group so it doesn't render the dock.
 *
 * For first ship this is a static-shape page; once public_share_enabled is
 * set on operator + posts.visibility='public' surfaces, the live feed populates.
 */
export const runtime = 'edge'

import { Logo } from '@/components/Logo'

export default function PublicProfilePage({ params }: { params: { handle: string } }) {
  return (
    <div className="landing-page">
      <div className="topbar">
        <a href="/" className="hero-logo">
          <Logo size={32} />
          <span className="wordmark">neolog</span>
        </a>
        <div className="nav-right">
          <a href="/timeline" className="login">Open my Neolog</a>
        </div>
      </div>

      <section className="hero-section">
        <div className="hero-eyebrow">@{params.handle}</div>
        <h1 className="hero-h1">A personal graph,<br />published.</h1>
        <p className="hero-lead">
          The public surface of @{params.handle}'s thinking — articles, X threads, and clips that they've chosen to share. The full graph lives privately.
        </p>
      </section>

      <section className="features-section">
        <div className="pitch-kicker">Latest</div>
        <h2 className="section-h2">Nothing public yet.</h2>
        <p style={{ color: 'var(--fg-2)', fontSize: 14, marginTop: 16, maxWidth: 540 }}>
          The operator hasn't shared a public piece yet. When they do, articles and threads land here in reverse chronological order.
        </p>
      </section>

      <footer className="site-footer">
        <div className="credit">Neolog · @{params.handle}</div>
        <div className="links">
          <a href="/">Built on Neolog</a>
        </div>
      </footer>
    </div>
  )
}
