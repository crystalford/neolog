
type EmbeddingResponse = {
  data: Array<{ embedding: number[] }>
  usage?: {
    prompt_tokens?: number
    total_tokens?: number
  }
}

export const EMBEDDING_DIM = 1536

export const sha256 = async (input: string) => {
  const msgUint8 = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export const vectorLiteral = (vec: number[]) => `[${vec.join(',')}]`

export async function embedTextWithOpenAI(opts: {
  apiKey: string
  text: string
  model?: string
  onUsage?: (usage: { prompt_tokens?: number; total_tokens?: number }) => void
}) {
  const apiKey = opts.apiKey
  const text = opts.text
  const model = opts.model || process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'

  if (!apiKey) throw new Error('Missing OpenAI API key')
  if (!text.trim()) throw new Error('Missing text for embedding')

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input: text }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Embedding request failed (${res.status}): ${errText}`)
  }

  const json = (await res.json()) as EmbeddingResponse
  if (opts.onUsage && json.usage) {
    opts.onUsage({
      prompt_tokens: json.usage.prompt_tokens,
      total_tokens: json.usage.total_tokens,
    })
  }
  const embedding = json.data?.[0]?.embedding

  if (!embedding || !Array.isArray(embedding)) {
    throw new Error('Embedding response missing embedding array')
  }

  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(
      `Unexpected embedding dim ${embedding.length} (expected ${EMBEDDING_DIM}). Check OPENAI_EMBEDDING_MODEL.`,
    )
  }

  return embedding
}

export function pickTextForEmbedding(post: {
  title: string | null
  excerpt: string | null
  content: string | null
  content_html: string | null
}) {
  const parts: string[] = []
  if (post.title) parts.push(post.title)
  if (post.excerpt) parts.push(post.excerpt)
  if (post.content) parts.push(post.content)
  else if (post.content_html) parts.push(post.content_html)
  return parts.join('\n\n').trim()
}
