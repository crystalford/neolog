import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

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
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const provider = typeof body.provider === 'string' ? body.provider : ''
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey : ''
  const label = typeof body.label === 'string' ? body.label : null

  if (!provider || !apiKey) {
    return NextResponse.json({ error: 'Provider and API key are required.' }, { status: 400 })
  }

  try {
    const encrypted = encrypt(apiKey)
    const payload = {
      user_id: session.user.id,
      provider,
      label,
      encrypted_key: `${encrypted.encrypted}:${encrypted.tag}`,
      iv: encrypted.iv,
    }

    const { error } = await supabase
      .from('integration_keys')
      .upsert(payload, { onConflict: 'user_id,provider,label' })

    if (error) {
      return NextResponse.json({ error: 'Failed to save integration.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to encrypt key.' }, { status: 500 })
  }
}
