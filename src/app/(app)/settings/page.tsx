/**
 * Settings — operator profile, voice, models, integrations, storage,
 * pipeline. Canon-styled.
 *
 * Functionally identical to before — operator card + 6 sections of
 * read-only rows. Just rebuilt around canon eyebrow/h1 + canon-section
 * blocks instead of the legacy .pad/.hero/.settings-grid classes.
 *
 * System health collapsed in as one row at the top (was a separate
 * /system route until Phase 6).
 */
export const runtime = 'edge'

import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'
import { headers } from 'next/headers'
import Shell from '@/components/Shell'
import { ModelPreferences } from './ModelPreferences'
import { VoicePreferences } from './VoicePreferences'
import { BraveKeyRow } from './BraveKeyRow'
import { FixThumbnailsButton } from './FixThumbnailsButton'
import { FixTranscodesButton } from './FixTranscodesButton'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export default async function SettingsPage() {
  const env = getRequestContext().env as unknown as Env
  const req = new Request('http://internal/', { headers: headers() })

  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) {
      return (
        <Shell>
          <SettingsHero subtitle="You're not signed in."/>
        </Shell>
      )
    }
    throw e
  }

  const db = getDb(env)
  const vlogCount    = await findOne<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM vlogs WHERE operator_id = ? AND deleted_at IS NULL', operator.id)
  const threadCount  = await findOne<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM threads WHERE operator_id = ? AND deleted_at IS NULL', operator.id)
  const clusterCount = await findOne<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM clusters WHERE operator_id = ? AND deleted_at IS NULL', operator.id)
  const initials = (operator.display_name || operator.email).slice(0, 2).toUpperCase()

  return (
    <Shell>
      <SettingsHero subtitle="Identity, voice, integrations, infrastructure health, and the keys that make the system run."/>

      {/* Operator card */}
      <div className="canon-reveal d2" style={{ marginBottom: 24 }}>
        <div style={{
          background: 'var(--bg-1)',
          border: '1px solid var(--line-1)',
          borderRadius: 14,
          padding: '20px 24px',
          display: 'flex', alignItems: 'center', gap: 18,
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--t-violet), var(--t-teal))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-body)', fontWeight: 500,
            fontSize: 22, color: 'var(--bg)',
            letterSpacing: '-0.5px',
            flexShrink: 0,
          }}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--font-body)', fontWeight: 500,
              fontSize: 19, color: 'var(--fg)', letterSpacing: '-0.3px',
            }}>{operator.display_name || operator.email.split('@')[0]}</div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)',
              letterSpacing: 1, marginTop: 3,
            }}>
              {operator.handle ? `${operator.handle} · neolog.ai` : operator.email}
            </div>
            <div style={{
              marginTop: 10, display: 'flex', gap: 18,
              fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-3)',
              letterSpacing: 0.4,
            }}>
              <span><strong style={{ color: 'var(--fg-1)' }}>{vlogCount?.n ?? 0}</strong> vlogs</span>
              <span><strong style={{ color: 'var(--fg-1)' }}>{threadCount?.n ?? 0}</strong> threads</span>
              <span><strong style={{ color: 'var(--fg-1)' }}>{clusterCount?.n ?? 0}</strong> clusters</span>
            </div>
          </div>
        </div>
      </div>

      {/* Health card */}
      <a href="/system" className="canon-reveal d2" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 18px',
        background: 'var(--bg-1)',
        border: '1px solid var(--line-1)',
        borderLeft: '2px solid var(--sig)',
        borderRadius: 10,
        textDecoration: 'none', color: 'var(--fg-1)',
        marginBottom: 32,
      }}>
        <div>
          <div style={{
            fontSize: 13, fontWeight: 500, marginBottom: 4,
            display: 'inline-flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: 'var(--sig)',
              boxShadow: '0 0 8px var(--sig-glow)',
              animation: 'canon-pulse 2.4s ease-in-out infinite',
            }}/>
            System health
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)',
            letterSpacing: 0.4,
          }}>
            D1 · R2 · Workers AI · FFmpeg · Anthropic
          </div>
        </div>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 11,
          letterSpacing: 1.4, textTransform: 'uppercase',
          color: 'var(--fg-3)',
        }}>Open →</span>
      </a>

      {/* Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <Section title="Identity">
          <Row k="Operator profile" sub="Background, current focus, voice signature — used by the AI" arrow/>
          <Row k="Voice profile" sub="Operator default · reference corpus auto-populated" arrow/>
          <Row k="Timezone" v={operator.tz} arrow/>
        </Section>

        <Section title="AI models">
          <ModelPreferences/>
        </Section>

        <Section title="Your voice">
          <VoicePreferences/>
        </Section>

        <Section title="API keys">
          <Row k="Anthropic" sub="claude-sonnet-4-6 (max tier + chat 'claude' option)" badge="Active" arrow/>
          <Row k="Workers AI" sub="Llama 4 Scout · Kimi K2.6 · Whisper — all native" badge="Active" arrow/>
          <BraveKeyRow/>
        </Section>

        <Section title="Integrations">
          <Row k="X / Twitter" sub="For shipping posts" badge="Not connected" badgeKind="empty" arrow/>
          <Row k="Cloudflare Access" sub={`${operator.email} · OTP via email`} badge="Active" arrow/>
        </Section>

        <Section title="Storage">
          <Row k="R2 bucket" v="neolog-videos" arrow/>
          <Row k="D1 database" v="neolog" arrow/>
          <Row k="Pages project" v="neolog · neolog.ai" arrow/>
        </Section>

        <Section title="Pipeline">
          <Row k="Riff confidence threshold" v="0.85" sub="Cosine similarity for auto-link" arrow/>
          <Row k="Transcription provider" v="Workers AI Whisper" sub="Switch to Claude per-vlog when available" arrow/>
          <Row k="Voice preservation hard check" v="On" sub="Each thread must contain a verbatim 4-word substring" arrow/>
        </Section>

        <Section title="Maintenance">
          <Row k="Missing thumbnails" sub="Walk every vlog where thumbnail_r2_key IS NULL and run the ffmpeg cascade to backfill. Safe to re-run."/>
          <FixThumbnailsButton/>
          <Row k="Missing H.264 transcode" sub="Re-dispatch the workflow for every video where transcoded_r2_key is null. Chrome can't decode raw HEVC on Windows, so these vlogs play audio-only without an H.264 fallback. Safe to re-run."/>
          <FixTranscodesButton/>
        </Section>
      </div>

      <footer className="canon-detail-footer">
        <span>neolog · settings</span>
        <span/>
      </footer>
    </Shell>
  )
}

function SettingsHero({ subtitle }: { subtitle: string }) {
  return (
    <section className="canon-reveal d1" style={{ padding: '8px 0 32px' }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 3.2,
        textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 20,
        display: 'inline-flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ width: 28, height: 1, background: 'var(--line-3)' }}/>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sig)', boxShadow: '0 0 8px var(--sig-glow)' }}/>
        The operator · configured
      </div>
      <h1 style={{
        fontFamily: 'var(--font-body)', fontWeight: 400,
        fontSize: 68, lineHeight: 1.0, letterSpacing: '-2.6px',
        color: 'var(--fg)', margin: '0 0 22px', textWrap: 'balance',
      }}>
        Settings<span style={{ color: 'var(--fg-3)', fontWeight: 300 }}>,</span> yours<span style={{ color: 'var(--sig)' }}>.</span>
      </h1>
      <p style={{
        fontSize: 17, lineHeight: 1.55, color: 'var(--fg-2)',
        maxWidth: 660, letterSpacing: '-0.15px', margin: 0,
      }}>
        {subtitle}
      </p>
    </section>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="canon-section">
      <div className="canon-section-head">
        <h2>{title}</h2>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--line-1)', border: '1px solid var(--line-1)', borderRadius: 10, overflow: 'hidden' }}>
        {children}
      </div>
    </section>
  )
}

function Row({ k, v, sub, badge, badgeKind, arrow }: { k: string; v?: string; sub?: string; badge?: string; badgeKind?: 'empty' | 'connected'; arrow?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 18px',
      background: 'var(--bg-1)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
          color: 'var(--fg)', letterSpacing: '-0.2px',
        }}>{k}</div>
        {sub && (
          <div style={{
            fontSize: 12, color: 'var(--fg-3)',
            marginTop: 3, lineHeight: 1.45,
          }}>{sub}</div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        {v && <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 12,
          color: 'var(--fg-1)', letterSpacing: 0.4,
        }}>{v}</span>}
        {badge && (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9,
            letterSpacing: 1.4, textTransform: 'uppercase',
            padding: '4px 10px', borderRadius: 100,
            background: badgeKind === 'empty' ? 'transparent' : 'color-mix(in srgb, var(--t-sage) 12%, transparent)',
            border: `1px solid ${badgeKind === 'empty' ? 'var(--line-2)' : 'color-mix(in srgb, var(--t-sage) 40%, transparent)'}`,
            color: badgeKind === 'empty' ? 'var(--fg-3)' : 'var(--t-sage)',
          }}>{badge}</span>
        )}
        {arrow && <span style={{ color: 'var(--fg-4)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>→</span>}
      </div>
    </div>
  )
}
