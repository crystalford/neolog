/**
 * Settings — identity, voice, integrations, infrastructure.
 * Faithful port of prototypes/settings.html, trimmed to the Cloudflare-only
 * stack (Anthropic for AI, Workers AI for Whisper — no Groq/Replicate/OpenAI/
 * ElevenLabs).
 */
export const runtime = 'edge'

import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'
import { headers } from 'next/headers'
import { ModelPreferences } from './ModelPreferences'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export default async function SettingsPage() {
  const env = getRequestContext().env as unknown as Env
  const req = new Request('http://internal/', { headers: headers() })

  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) {
      return (
        <main>
          <section className="hero">
            <h1 className="reveal d3">Settings</h1>
            <p className="lead reveal d4">You're not signed in.</p>
          </section>
        </main>
      )
    }
    throw e
  }

  const db = getDb(env)
  const vlogCount = await findOne<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM vlogs WHERE operator_id = ? AND deleted_at IS NULL', operator.id)
  const threadCount = await findOne<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM threads WHERE operator_id = ? AND deleted_at IS NULL', operator.id)
  const clusterCount = await findOne<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM clusters WHERE operator_id = ? AND deleted_at IS NULL', operator.id)

  const initials = (operator.display_name || operator.email).slice(0, 2).toUpperCase()

  return (
    <main>
      <section className="hero">
        <div className="crumb reveal d2">Settings</div>
        <h1 className="reveal d3">Yours</h1>
        <p className="lead reveal d4">Identity, voice, integrations, and the keys that make the system run.</p>
      </section>

      <div style={{ padding: '0 24px 4px' }}>
        <div className="reveal d4" style={{
          background: 'var(--ink-2)',
          border: '1px solid var(--line)',
          borderRadius: 14,
          padding: '18px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}>
          <div style={{
            width: 56, height: 56,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--t-brass), var(--t-terra))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 500, fontSize: 18, color: 'var(--ink)',
            letterSpacing: '-0.5px',
            flexShrink: 0,
          }}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500, fontSize: 17, color: 'var(--bone)', letterSpacing: '-0.3px' }}>
              {operator.display_name || operator.email.split('@')[0]}
            </div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--bone-3)', letterSpacing: 1, marginTop: 2 }}>
              {operator.handle ? `${operator.handle} · neolog.ai` : operator.email}
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 14, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--bone-3)' }}>
              <span><strong style={{ color: 'var(--bone-1)' }}>{vlogCount?.n ?? 0}</strong> sessions</span>
              <span><strong style={{ color: 'var(--bone-1)' }}>{threadCount?.n ?? 0}</strong> threads</span>
              <span><strong style={{ color: 'var(--bone-1)' }}>{clusterCount?.n ?? 0}</strong> clusters</span>
            </div>
          </div>
        </div>
      </div>

      <div className="settings-grid reveal d5" style={{ paddingTop: 18 }}>
        <Section title="Identity">
          <Row k="Operator profile" sub="Background, current focus, voice signature — used by the AI" arrow />
          <Row k="Voice profile" sub="Operator default · reference corpus auto-populated" arrow />
          <Row k="Timezone" v={operator.tz} arrow />
        </Section>

        <Section title="AI models">
          <ModelPreferences />
        </Section>

        <Section title="API keys">
          <Row k="Anthropic" sub="claude-sonnet-4-6 (max tier + chat 'claude' option)" badge="Active" arrow />
          <Row k="Workers AI" sub="Llama 4 Scout · Kimi K2.6 · Whisper · all native" badge="Active" arrow />
        </Section>

        <Section title="Integrations">
          <Row k="X / Twitter" sub="For shipping posts" badge="Not connected" badgeKind="empty" arrow />
          <Row k="Cloudflare Access" sub={`${operator.email} · OTP via email`} badge="Active" arrow />
        </Section>

        <Section title="Storage">
          <Row k="R2 bucket" v="neolog-videos" arrow />
          <Row k="D1 database" v="neolog" arrow />
          <Row k="Pages project" v="neolog · neolog.ai" arrow />
        </Section>

        <Section title="Pipeline">
          <Row k="Riff confidence threshold" v="0.85" sub="Cosine similarity for auto-link" arrow />
          <Row k="Transcription provider" v="Workers AI Whisper" sub="Switch to Claude per-vlog when available" arrow />
          <Row k="Voice preservation hard check" v="On" sub="Each thread must contain a verbatim 4-word substring" arrow />
        </Section>
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="settings-section">
      <div className="label">{title}</div>
      {children}
    </div>
  )
}

function Row({ k, v, sub, badge, badgeKind, arrow }: { k: string; v?: string; sub?: string; badge?: string; badgeKind?: 'empty' | 'connected'; arrow?: boolean }) {
  return (
    <div className="row">
      <div className="k">
        {k}
        {sub && <span className="sub">{sub}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {v && <span className="v">{v}</span>}
        {badge && (
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
            padding: '4px 10px',
            borderRadius: 100,
            background: badgeKind === 'empty' ? 'transparent' : 'rgba(122,154,106,0.10)',
            border: `1px solid ${badgeKind === 'empty' ? 'var(--line-warm)' : 'rgba(122,154,106,0.40)'}`,
            color: badgeKind === 'empty' ? 'var(--bone-3)' : 'var(--state-ok)',
          }}>{badge}</span>
        )}
        {arrow && <span style={{ color: 'var(--bone-4)', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>→</span>}
      </div>
    </div>
  )
}
