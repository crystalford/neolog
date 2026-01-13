import crypto from 'crypto'
import { NextRequest } from 'next/server'

type SignatureParts = {
  keyId: string
  headers: string
  signature: string
  algorithm?: string
}

const parseSignatureHeader = (header: string): SignatureParts | null => {
  const parts: Record<string, string> = {}
  const regex = /([a-zA-Z]+)="([^"]*)"/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(header)) !== null) {
    parts[match[1]] = match[2]
  }

  if (!parts.keyId || !parts.signature) {
    return null
  }

  return {
    keyId: parts.keyId,
    headers: parts.headers || 'date',
    signature: parts.signature,
    algorithm: parts.algorithm,
  }
}

const buildSigningString = (request: NextRequest, headersList: string[]) => {
  const lines: string[] = []
  const method = request.method.toLowerCase()
  const path = `${request.nextUrl.pathname}${request.nextUrl.search}`

  for (const header of headersList) {
    if (header === '(request-target)') {
      lines.push(`(request-target): ${method} ${path}`)
      continue
    }

    const value = request.headers.get(header)
    if (!value) {
      return null
    }
    lines.push(`${header}: ${value}`)
  }

  return lines.join('\n')
}

const verifyDigest = (bodyText: string, digestHeader: string) => {
  const expected = `SHA-256=${crypto.createHash('sha256').update(bodyText, 'utf8').digest('base64')}`
  return digestHeader === expected
}

const fetchPublicKey = async (keyId: string) => {
  const keyUrl = keyId.split('#')[0]
  const response = await fetch(keyUrl, {
    headers: { Accept: 'application/activity+json' },
  })
  if (!response.ok) {
    return null
  }
  const actor = await response.json()
  if (!actor?.publicKey?.publicKeyPem) {
    return null
  }
  if (actor.publicKey?.id && actor.publicKey.id !== keyId) {
    return null
  }
  return actor.publicKey.publicKeyPem as string
}

export async function verifyActivityPubRequest(
  request: NextRequest,
  bodyText: string
) {
  const signatureHeader = request.headers.get('signature')
  if (!signatureHeader) {
    return { ok: false, error: 'Missing Signature header' }
  }

  const parsed = parseSignatureHeader(signatureHeader)
  if (!parsed) {
    return { ok: false, error: 'Invalid Signature header' }
  }

  const headersList = parsed.headers.toLowerCase().split(' ').filter(Boolean)
  const signingString = buildSigningString(request, headersList)
  if (!signingString) {
    return { ok: false, error: 'Missing signed headers' }
  }

  const digestHeader = request.headers.get('digest')
  if (digestHeader && !verifyDigest(bodyText, digestHeader)) {
    return { ok: false, error: 'Invalid Digest header' }
  }

  const publicKeyPem = await fetchPublicKey(parsed.keyId)
  if (!publicKeyPem) {
    return { ok: false, error: 'Unable to resolve public key' }
  }

  const verifier = crypto.createVerify('RSA-SHA256')
  verifier.update(signingString, 'utf8')
  verifier.end()

  const signatureBytes = Buffer.from(parsed.signature, 'base64')
  const verified = verifier.verify(publicKeyPem, signatureBytes)

  if (!verified) {
    return { ok: false, error: 'Signature verification failed' }
  }

  return { ok: true, keyId: parsed.keyId }
}
