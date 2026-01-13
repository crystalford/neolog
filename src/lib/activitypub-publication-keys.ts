import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

type ActivityPubKeyPair = {
  publicKeyPem: string
  privateKeyPem: string
}

export async function getOrCreatePublicationKeys(publicationId: string): Promise<ActivityPubKeyPair> {
  const admin = createAdminClient()
  if (!admin) {
    throw new Error('Supabase service role key is missing.')
  }

  const { data: existing, error } = await admin
    .from('activitypub_publication_keys')
    .select('public_key_pem, private_key_pem')
    .eq('publication_id', publicationId)
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
    .from('activitypub_publication_keys')
    .insert({
      publication_id: publicationId,
      public_key_pem: publicKey,
      private_key_pem: privateKey,
    })

  if (insertError) {
    throw insertError
  }

  return { publicKeyPem: publicKey, privateKeyPem: privateKey }
}
