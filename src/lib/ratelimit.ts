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
  window: number
}

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  reset: number
}

/**
 * Simple in-memory rate limiter
 * For production, consider using Redis or Upstash
 */
export function rateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now()
  const windowMs = config.window * 1000
  const key = identifier

  let entry = store.get(key)

  // If no entry or expired, create new one
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 1,
      resetAt: now + windowMs,
    }
    store.set(key, entry)
    return {
      success: true,
      limit: config.limit,
      remaining: config.limit - 1,
      reset: entry.resetAt,
    }
  }

  // Increment count
  entry.count++
  store.set(key, entry)

  // Check if over limit
  if (entry.count > config.limit) {
    return {
      success: false,
      limit: config.limit,
      remaining: 0,
      reset: entry.resetAt,
    }
  }

  return {
    success: true,
    limit: config.limit,
    remaining: config.limit - entry.count,
    reset: entry.resetAt,
  }
}

/**
 * Rate limit by IP address
 */
export function rateLimitByIP(
  request: Request,
  config: RateLimitConfig
): RateLimitResult {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown'
  return rateLimit(`ip:${ip}`, config)
}

/**
 * Rate limit by user ID
 */
export function rateLimitByUser(
  userId: string,
  config: RateLimitConfig
): RateLimitResult {
  return rateLimit(`user:${userId}`, config)
}

/**
 * Combined rate limit - checks both IP and user
 */
export function rateLimitCombined(
  request: Request,
  userId: string | null,
  config: RateLimitConfig
): RateLimitResult {
  // Check IP limit first
  const ipResult = rateLimitByIP(request, config)
  if (!ipResult.success) {
    return ipResult
  }

  // If user is logged in, also check user limit
  if (userId) {
    const userResult = rateLimitByUser(userId, config)
    if (!userResult.success) {
      return userResult
    }
    // Return the more restrictive result
    return userResult.remaining < ipResult.remaining ? userResult : ipResult
  }

  return ipResult
}

// Preset configurations
export const RATE_LIMITS = {
  // API endpoints
  api: { limit: 100, window: 60 },           // 100 requests per minute
  apiStrict: { limit: 10, window: 60 },      // 10 requests per minute
  
  // Auth
  login: { limit: 5, window: 300 },          // 5 attempts per 5 minutes
  signup: { limit: 3, window: 3600 },        // 3 signups per hour
  passwordReset: { limit: 3, window: 3600 }, // 3 resets per hour
  
  // Content creation
  post: { limit: 10, window: 3600 },         // 10 posts per hour
  comment: { limit: 30, window: 3600 },      // 30 comments per hour
  upload: { limit: 20, window: 3600 },       // 20 uploads per hour
  
  // Interactions
  upvote: { limit: 100, window: 3600 },      // 100 upvotes per hour
  follow: { limit: 50, window: 3600 },       // 50 follows per hour
  
  // Search
  search: { limit: 30, window: 60 },         // 30 searches per minute
  
  // Email
  subscribe: { limit: 5, window: 3600 },     // 5 subscriptions per hour
  sendEmail: { limit: 10, window: 3600 },    // 10 emails per hour
} as const
