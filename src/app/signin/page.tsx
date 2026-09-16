/**
 * Sign-in — Cloudflare Access one-time PIN screen.
 * Public route. Cloudflare Access handles the actual flow.
 *
 * ⚠️ Two real bugs lived here, not just style. A 40-node radial starburst
 * animation was the only decorative background anywhere in the product —
 * nothing else in neolog uses one, and it's gone. And the email field's
 * `defaultValue` was `crystal@neolog.ai`, which is not the operator's
 * address (`docs/CREDENTIALS.md`'s `OPERATOR_EMAIL`, the one Cloudflare
 * Access is actually configured to allow, is `chrisrobtelford@gmail.com`).
 * Pressing "Send PIN" without noticing and clearing the field would have
 * requested a PIN for an address that was never his.
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
    }}>
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
            <div className="mono" style={{ fontSize: 11, color: 'var(--fg-3)', marginBottom: 6 }}>Email</div>
            <input
              name="email"
              type="email"
              defaultValue="chrisrobtelford@gmail.com"
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

          <button type="submit" className="btn primary" style={{ width: '100%', justifyContent: 'center', padding: 12, fontSize: 14 }}>
            Send PIN →
          </button>
        </form>

        <div className="mono" style={{ fontSize: 11, color: 'var(--fg-4)', textAlign: 'center', marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
          neolog.cloudflareaccess.com · single operator
        </div>
      </div>
    </div>
  )
}
