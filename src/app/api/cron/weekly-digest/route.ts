export const runtime = 'edge'

const deprecated = () => Response.json({ error: "Deprecated in Cloudflare migration." }, { status: 410 })

export const GET = deprecated
export const POST = deprecated
export const PUT = deprecated
export const DELETE = deprecated
export const PATCH = deprecated
