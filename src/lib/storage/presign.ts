const encoder = new TextEncoder();

const sha256Hex = async (data: string) => {
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

const hmac = async (key: Uint8Array | string, data: string | Uint8Array): Promise<Uint8Array> => {
  const keyData = typeof key === 'string' ? encoder.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const dataToSign = typeof data === 'string' ? encoder.encode(data) : data;
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, dataToSign);
  return new Uint8Array(signature);
};

const getSignatureKey = async (key: string, dateStamp: string, regionName: string, serviceName: string) => {
  const kDate = await hmac(`AWS4${key}`, dateStamp);
  const kRegion = await hmac(kDate, regionName);
  const kService = await hmac(kRegion, serviceName);
  return await hmac(kService, 'aws4_request');
};

const toAmzDate = (date: Date) => date.toISOString().replace(/[:-]|\.\d{3}/g, '')

export type PresignInput = {
  accessKeyId: string;
  secretKey: string;
  bucket: string;
  key: string;
  region: string;
  endpoint: string;
  expiresIn?: number;
  method?: 'PUT' | 'GET';
}

export const presignS3Url = async ({
  accessKeyId,
  secretKey,
  bucket,
  key,
  region,
  endpoint,
  expiresIn = 900,
  method = 'PUT',
}: PresignInput) => {
  const service = 's3';
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);

  const url = new URL(endpoint);
  const host = url.host;
  const canonicalUri = `/${bucket}/${encodeURIComponent(key).replace(/%2F/g, '/')}`;

  const credential = `${accessKeyId}/${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalQuery = [
    `X-Amz-Algorithm=AWS4-HMAC-SHA256`,
    `X-Amz-Credential=${encodeURIComponent(credential)}`,
    `X-Amz-Date=${amzDate}`,
    `X-Amz-Expires=${expiresIn}`,
    `X-Amz-SignedHeaders=host`,
  ].join('&');

  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    `${dateStamp}/${region}/${service}/aws4_request`,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = await getSignatureKey(secretKey, dateStamp, region, service);
  const signatureBuffer = await hmac(signingKey, stringToSign);
  const signature = Array.from(signatureBuffer).map(b => b.toString(16).padStart(2, '0')).join('');

  return `${url.protocol}//${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

