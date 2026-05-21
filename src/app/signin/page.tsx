/**
 * Sign-in — Cloudflare Access one-time PIN screen.
 * Ported from neolog-design/project/screens/signin.jsx.
 * Public route. Cloudflare Access handles the actual flow.
 */

import { LogoMark } from '@/components/Shell'

export const runtime = 'edge'

export default function SignInPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      color: 'var(--fg)',
      fontFamily: 'var(--font-body)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <svg viewBox="0 0 1200 800" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.5, pointerEvents: 'none' }}>
        <defs>
          <radialGradient id="sg-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(59,130,246,0.10)"/>
            <stop offset="100%" stopColor="transparent"/>
          </radialGradient>
        </defs>
        <circle cx="600" cy="400" r="280" fill="url(#sg-bg)"/>
        {Array.from({length: 40}).map((_, i) => {
          const a = (i / 40) * Math.PI * 2
          const r = 160 + (i % 5) * 50
          const x = 600 + Math.cos(a) * r
          const y = 400 + Math.sin(a) * r
          return (
            <g key={i}>
              <line x1="600" y1="400" x2={x} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="0.5"/>
              <circle cx={x} cy={y} r="1.6" fill="var(--fg-4)"/>
            </g>
          )
        })}
        <circle cx="600" cy="400" r="10" fill="var(--sig)" opacity="0.9"/>
      </svg>

      <div style={{
        width: 420, padding: 36, position: 'relative',
        background: 'var(--bg-1)', border: '1px solid var(--line)',
        borderRadius: 14,
        boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
          <LogoMark size={22}/>
          <span style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-0.3px' }}>neolog</span>
        </div>

        <h1 style={{ fontSize: 26, fontWeight: 500, letterSpacing: '-0.6px', marginBottom: 8, lineHeight: 1.15 }}>
          Welcome back.
        </h1>
        <p style={{ fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.55, marginBottom: 28 }}>
          We'll email you a one-time PIN. No password — Cloudflare Access handles the rest.
        </p>

        <form action="https://neolog.cloudflareaccess.com" method="get">
          <div style={{ marginBottom: 16 }}>
            <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Email</div>
            <input
              name="email"
              type="email"
              defaultValue="crystal@neolog.ai"
              autoComplete="email"
              style={{
                width: '100%', padding: '11px 14px',
                background: 'var(--bg-2)',
                border: '1px solid var(--line-1)',
                borderRadius: 8,
                fontSize: 14, color: 'var(--fg)',
              }}
            />
          </div>

          <button type="submit" className="canon-btn primary" style={{ width: '100%', justifyContent: 'center', padding: 12, fontSize: 14 }}>
            Send PIN →
          </button>
        </form>

        <div className="mono" style={{ fontSize: 10, color: 'var(--fg-4)', letterSpacing: 0.4, textAlign: 'center', marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--line)', textTransform: 'uppercase' }}>
          neolog.cloudflareaccess.com · single operator
        </div>
      </div>
    </div>
  )
}
