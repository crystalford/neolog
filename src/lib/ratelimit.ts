/**
 * Simple in-memory rate limiter
 * For production, use Redis or similar
 */

type RateLimitEntry = {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  store.forEach((entry, key) => {
    if (entry.resetAt < now) {
      store.delete(key)
    }
  })
}, 5 * 60 * 1000)

export interface RateLimitConfig {
  /** Maximum number of requests in the window */
  limit: number
  /** Window size in seconds */
  windowSeconds: number
}

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  resetAt: number
}

/**
 * Check rate limit for a given identifier
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now()
  const key = identifier
  const entry = store.get(key)

  // If no entry or expired, create new one
  if (!entry || entry.resetAt < now) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + config.windowSeconds * 1000,
    }
    store.set(key, newEntry)
    
    return {
      success: true,
      limit: config.limit,
      remaining: config.limit - 1,
      resetAt: newEntry.resetAt,
    }
  }

  // Increment counter
  entry.count++

  // Check if over limit
  if (entry.count > config.limit) {
    return {
      success: false,
      limit: config.limit,
      remaining: 0,
      resetAt: entry.resetAt,
    }
  }

  return {
    success: true,
    limit: config.limit,
    remaining: config.limit - entry.count,
    resetAt: entry.resetAt,
  }
}

/**
 * Rate limit presets for common use cases
 */
export const rateLimits = {
  // General API: 100 requests per minute
  api: { limit: 100, windowSeconds: 60 },
  
  // Auth endpoints: 10 per minute
  auth: { limit: 10, windowSeconds: 60 },
  
  // Write operations: 30 per minute
  write: { limit: 30, windowSeconds: 60 },
  
  // Search: 30 per minute
  search: { limit: 30, windowSeconds: 60 },
  
  // Upload: 10 per minute
  upload: { limit: 10, windowSeconds: 60 },
  
  // Email: 5 per minute
  email: { limit: 5, windowSeconds: 60 },
  
  // Webhooks: 100 per second (high throughput)
  webhook: { limit: 100, windowSeconds: 1 },
}

/**
 * Get client identifier from request
 */
export function getClientIdentifier(request: Request): string {
  // Try to get real IP from various headers
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  
  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }
  
  // Fallback to a hash of user agent (not ideal but better than nothing)
  const ua = request.headers.get('user-agent') || 'unknown'
  return `ua-${hashString(ua)}`
}

/**
 * Simple string hash for fallback identification
 */
function hashString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

/**
 * Create rate limit headers for response
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(result.resetAt / 1000).toString(),
  }
}
