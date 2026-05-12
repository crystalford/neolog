/**
 * Settings — operator profile, voice profile, API keys, integrations,
 * storage, riff confidence threshold, X account, etc. Stub for now;
 * builds out alongside voice profiles + integration plumbing.
 */
export const runtime = 'edge'

import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'
import { headers } from 'next/headers'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export default async function SettingsPage() {
  const env = getRequestContext().env as unknown as Env
  const fakeReq = new Request('http://internal/', { headers: headers() })
  let operator
  try {
    operator = await requireOperator(fakeReq, env)
  } catch (e) {
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
  const vlogCount = await findOne<{ n: number }>(
    db,
    'SELECT COUNT(*) AS n FROM vlogs WHERE operator_id = ? AND deleted_at IS NULL',
    operator.id,
  )
  const threadCount = await findOne<{ n: number }>(
    db,
    'SELECT COUNT(*) AS n FROM threads WHERE operator_id = ?',
    operator.id,
  )

  return (
    <main>
      <section className="hero">
        <div className="crumb reveal d2">You + the system</div>
        <h1 className="reveal d3">Settings</h1>
        <p className="lead reveal d4">Operator profile, voice profile, API keys, integrations.</p>
      </section>

      <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
        <SettingRow label="Operator email" value={operator.email} />
        <SettingRow label="Display name" value={operator.display_name || '—'} />
        <SettingRow label="Handle" value={operator.handle ? `@${operator.handle}` : '—'} />
        <SettingRow label="Timezone" value={operator.tz} />
        <SettingRow label="Vlogs in archive" value={`${vlogCount?.n ?? 0}`} />
        <SettingRow label="Threads extracted" value={`${threadCount?.n ?? 0}`} />
      </div>

      <div className="stub-empty reveal d6" style={{ paddingTop: 40 }}>
        <div className="label">Editing coming next</div>
        <p>Voice profile management, X account connection, R2 storage view, riff confidence tuning, prompt versioning — all reachable from here once each ships.</p>
      </div>
    </main>
  )
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: 'var(--ink-2)',
      border: '1px solid var(--line)',
      borderRadius: 12,
      padding: '12px 16px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 16,
    }}>
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9,
        letterSpacing: 2,
        textTransform: 'uppercase',
        color: 'var(--bone-3)',
      }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--bone)', textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
    </div>
  )
}
