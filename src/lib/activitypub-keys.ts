import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

type ActivityPubKeyPair = {
  publicKeyPem: string
  privateKeyPem: string
}

export async function getOrCreateActorKeys(userId: string): Promise<ActivityPubKeyPair> {
  const admin = createAdminClient()
  if (!admin) {
    throw new Error('Supabase service role key is missing.')
  }

  const { data: existing, error } = await admin
    .from('activitypub_keys')
    .select('public_key_pem, private_key_pem')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (existing?.public_key_pem && existing?.private_key_pem) {
    return {
      publicKeyPem: existing.public_key_pem,
      privateKeyPem: existing.private_key_pem,
    }
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  const { error: insertError } = await admin
    .from('activitypub_keys')
    .insert({
      user_id: userId,
      public_key_pem: publicKey,
      private_key_pem: privateKey,
    })

  if (insertError) {
    throw insertError
  }

  return { publicKeyPem: publicKey, privateKeyPem: privateKey }
}
