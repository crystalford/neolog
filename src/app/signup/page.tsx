/**
 * Sign up — single-operator system so there's no public sign-up flow.
 * This page exists for symmetry with the prototype index, but it redirects
 * to /signin since only one operator (the owner of the Access policy) is allowed.
 */
export const runtime = 'edge'

import { Logo } from '@/components/Logo'

export default function SignUpPage() {
  return (
    <div className="landing-page">
      <div className="topbar">
        <a href="/" className="hero-logo">
          <Logo size={32} />
          <span className="wordmark">neolog</span>
        </a>
      </div>

      <section className="hero-section" style={{ maxWidth: 540 }}>
        <div className="hero-eyebrow">Single-operator</div>
        <h1 className="hero-h1" style={{ fontSize: 'clamp(40px, 5vw, 60px)' }}>
          Neolog is one graph,<br />for one person.
        </h1>
        <p className="hero-lead">
          This instance is provisioned for a specific operator at the Cloudflare Access layer. If you're the operator, sign in. If you want your own Neolog, the open-source kit will be released later.
        </p>
        <div className="cta-row">
          <a href="/signin" className="cta primary">Sign in</a>
          <a href="/" className="cta secondary">Back home</a>
        </div>
      </section>
    </div>
  )
}
