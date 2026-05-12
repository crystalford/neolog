/**
 * Sign in — Cloudflare Access handles the actual flow (one-time PIN to
 * operator email). This page is the bridge: it explains what's about to
 * happen and sends the operator to the Access flow.
 */
export const runtime = 'edge'

import { Logo } from '@/components/Logo'

export default function SignInPage() {
  return (
    <div className="landing-page">
      <div className="topbar">
        <a href="/" className="hero-logo">
          <Logo size={32} />
          <span className="wordmark">neolog</span>
        </a>
      </div>

      <section className="hero-section" style={{ maxWidth: 540 }}>
        <div className="hero-eyebrow">Sign in</div>
        <h1 className="hero-h1" style={{ fontSize: 'clamp(40px, 5vw, 60px)' }}>
          Cloudflare Access<br />gates everything.
        </h1>
        <p className="hero-lead">
          Click the button below and Cloudflare will email a one-time PIN to your operator address.
          Paste it back in, and you're in. No password to forget.
        </p>
        <div className="cta-row">
          <a href="/timeline" className="cta primary">Continue to Access</a>
          <a href="/" className="cta secondary">Back home</a>
        </div>
      </section>

      <footer className="site-footer">
        <div className="credit">Neolog · single-operator</div>
        <div className="links">
          <a href="/">Home</a>
        </div>
      </footer>
    </div>
  )
}
