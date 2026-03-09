import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

const getKey = () => {
  const secret = process.env.INTEGRATION_KEY_SECRET || ''
  if (!secret) {
    throw new Error('Missing INTEGRATION_KEY_SECRET')
  }
  return crypto.createHash('sha256').update(secret).digest()
}

const encrypt = (plain: string) => {
  const key = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const provider = typeof body.provider === 'string' ? body.provider : ''
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey : ''
    const label = typeof body.label === 'string' ? body.label.trim() || null : null

    finalMeta = { user_id: session.user.id, provider: provider || null, has_label: Boolean(label) }
    try {
      const run = await startJobRun('integrations.save', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    if (!provider || !apiKey) {
      finalErrorMessage = 'Provider and API key are required.'
      return NextResponse.json({ error: 'Provider and API key are required.' }, { status: 400 })
    }

    const encrypted = encrypt(apiKey)
    const payload = {
      user_id: session.user.id,
      provider,
      label,
      encrypted_key: `${encrypted.encrypted}:${encrypted.tag}`,
      iv: encrypted.iv,
      is_active: true,
    }

    const { data: saved, error } = await supabase
      .from('integration_keys')
      .upsert(payload, { onConflict: 'user_id,provider,label' })
      .select('id')
      .single()

    if (error) {
      if (error.code === '42P01') {
        finalErrorMessage = 'Database table missing. Please run the SQL migration (fix_settings_tables.sql) in your Supabase dashboard.'
      } else {
        finalErrorMessage = `Failed to save integration: ${error.message}`
      }
      return NextResponse.json({ error: finalErrorMessage }, { status: 500 })
    }

    if (saved?.id) {
      await supabase
        .from('integration_keys')
        .update({ is_active: false })
        .eq('user_id', session.user.id)
        .eq('provider', provider)
        .neq('id', saved.id)

      await supabase
        .from('integration_keys')
        .update({ is_active: true })
        .eq('id', saved.id)
    }

    finalStatus = 'success'
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    finalErrorMessage = error?.message || 'Failed to encrypt key.'
    return NextResponse.json({ error: finalErrorMessage }, { status: 500 })
  } finally {
    try {
      if (runId) {
        await finishJobRun(
          runId,
          finalStatus,
          { duration_ms: Date.now() - startedAt, ...finalMeta },
          finalErrorMessage,
        )
      }
    } catch {
      // best-effort
    }
  }
}
