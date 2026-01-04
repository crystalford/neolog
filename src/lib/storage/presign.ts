import crypto from 'crypto'

const sha256Hex = (data: string) =>
  crypto.createHash('sha256').update(data, 'utf8').digest('hex')

const hmac = (key: Buffer | string, data: string) =>
  crypto.createHmac('sha256', key).update(data, 'utf8').digest()

const getSignatureKey = (key: string, dateStamp: string, regionName: string, serviceName: string) => {
  const kDate = hmac(`AWS4${key}`, dateStamp)
  const kRegion = hmac(kDate, regionName)
  const kService = hmac(kRegion, serviceName)
  return hmac(kService, 'aws4_request')
}

const toAmzDate = (date: Date) => date.toISOString().replace(/[:-]|\.\d{3}/g, '')

export type PresignInput = {
  accessKeyId: string
  secretKey: string
  bucket: string
  key: string
  region: string
  endpoint: string
  expiresIn?: number
  method?: 'PUT' | 'GET'
}

export const presignS3Url = ({
  accessKeyId,
  secretKey,
  bucket,
  key,
  region,
  endpoint,
  expiresIn = 900,
  method = 'PUT',
}: PresignInput) => {
  const service = 's3'
  const now = new Date()
  const amzDate = toAmzDate(now)
  const dateStamp = amzDate.slice(0, 8)

  const url = new URL(endpoint)
  const host = url.host
  const canonicalUri = `/${bucket}/${encodeURIComponent(key).replace(/%2F/g, '/')}`

  const credential = `${accessKeyId}/${dateStamp}/${region}/${service}/aws4_request`
  const canonicalQuery = [
    `X-Amz-Algorithm=AWS4-HMAC-SHA256`,
    `X-Amz-Credential=${encodeURIComponent(credential)}`,
    `X-Amz-Date=${amzDate}`,
    `X-Amz-Expires=${expiresIn}`,
    `X-Amz-SignedHeaders=host`,
  ].join('&')

  const canonicalHeaders = `host:${host}\n`
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    `${dateStamp}/${region}/${service}/aws4_request`,
    sha256Hex(canonicalRequest),
  ].join('\n')

  const signingKey = getSignatureKey(secretKey, dateStamp, region, service)
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex')

  return `${url.protocol}//${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`
}
