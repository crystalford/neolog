import crypto from 'node:crypto'
import { getOrCreateActorKeys } from '@/lib/activitypub-keys'
import { getOrCreatePublicationKeys } from '@/lib/activitypub-publication-keys'

type RemoteActor = {
  id: string
  inbox?: string
  endpoints?: {
    sharedInbox?: string
  }
  preferredUsername?: string
  name?: string
}

const digestBody = (body: string) => {
  return `SHA-256=${crypto.createHash('sha256').update(body, 'utf8').digest('base64')}`
}

const signRequest = (
  method: string,
  targetUrl: string,
  body: string,
  keyId: string,
  privateKeyPem: string
) => {
  const url = new URL(targetUrl)
  const date = new Date().toUTCString()
  const digest = digestBody(body)
  const signingString = [
    `(request-target): ${method.toLowerCase()} ${url.pathname}${url.search}`,
    `host: ${url.host}`,
    `date: ${date}`,
    `digest: ${digest}`,
  ].join('\n')

  const signer = crypto.createSign('RSA-SHA256')
  signer.update(signingString, 'utf8')
  signer.end()

  const signature = signer.sign(privateKeyPem).toString('base64')
  const signatureHeader = [
    `keyId="${keyId}"`,
    'algorithm="rsa-sha256"',
    'headers="(request-target) host date digest"',
    `signature="${signature}"`,
  ].join(',')

  return { date, digest, signatureHeader }
}

export async function fetchRemoteActor(actorUrl: string): Promise<RemoteActor | null> {
  const response = await fetch(actorUrl, {
    headers: { Accept: 'application/activity+json' },
  })
  if (!response.ok) {
    return null
  }
  return response.json()
}

export async function sendSignedActivity(
  localUserId: string,
  localUsername: string,
  inboxUrl: string,
  activity: Record<string, unknown>
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://neolog.com'
  const actorUrl = `${baseUrl}/${localUsername}`
  const keyId = `${actorUrl}#main-key`

  const { privateKeyPem } = await getOrCreateActorKeys(localUserId)
  const body = JSON.stringify(activity)
  const { date, digest, signatureHeader } = signRequest('POST', inboxUrl, body, keyId, privateKeyPem)

  try {
    const response = await fetch(inboxUrl, {
      method: 'POST',
      headers: {
        Host: new URL(inboxUrl).host,
        Date: date,
        Digest: digest,
        Signature: signatureHeader,
        'Content-Type': 'application/activity+json',
        Accept: 'application/activity+json',
      },
      body,
    })

    const responseText = await response.text().catch(() => '')
    return {
      ok: response.ok,
      status: response.status,
      error: response.ok ? null : responseText || response.statusText,
    }
  } catch (error: any) {
    return {
      ok: false,
      status: 0,
      error: error?.message || 'Network error',
    }
  }
}

export async function sendSignedActivityForPublication(
  publicationId: string,
  publicationSlug: string,
  inboxUrl: string,
  activity: Record<string, unknown>
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://neolog.com'
  const actorUrl = `${baseUrl}/api/activitypub/publications/${publicationSlug}`
  const keyId = `${actorUrl}#main-key`

  const { privateKeyPem } = await getOrCreatePublicationKeys(publicationId)
  const body = JSON.stringify(activity)
  const { date, digest, signatureHeader } = signRequest('POST', inboxUrl, body, keyId, privateKeyPem)

  try {
    const response = await fetch(inboxUrl, {
      method: 'POST',
      headers: {
        Host: new URL(inboxUrl).host,
        Date: date,
        Digest: digest,
        Signature: signatureHeader,
        'Content-Type': 'application/activity+json',
        Accept: 'application/activity+json',
      },
      body,
    })

    const responseText = await response.text().catch(() => '')
    return {
      ok: response.ok,
      status: response.status,
      error: response.ok ? null : responseText || response.statusText,
    }
  } catch (error: any) {
    return {
      ok: false,
      status: 0,
      error: error?.message || 'Network error',
    }
  }
}
