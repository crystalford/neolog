import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'

const getSecretKey = () => {
  const secret = process.env.INTEGRATION_KEY_SECRET || ''
  if (!secret) {
    return null
  }
  return crypto.createHash('sha256').update(secret).digest()
}

export const decryptIntegrationKey = (encryptedKey: string, iv: string) => {
  const key = getSecretKey()
  if (!key) return null

  const [cipherText, tag] = encryptedKey.split(':')
  if (!cipherText || !tag) return null
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherText, 'base64')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

export const getIntegrationKey = async (userId: string, provider: string) => {
  const supabase = createClient()
  const { data } = await supabase
    .from('integration_keys')
    .select('encrypted_key, iv')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle()

  if (!data) return null
  return decryptIntegrationKey(data.encrypted_key, data.iv)
}
