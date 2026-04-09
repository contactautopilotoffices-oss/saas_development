/**
 * In-memory rate limiting utility for API routes.
 *
 * Tracks request counts per identifier (IP address or user ID) in a shared
 * `Map` and enforces configurable limits over sliding time windows. Expired
 * entries are cleaned up every minute by a background interval.
 *
 * **Note:** This is a single-process, single-instance implementation. For
 * multi-instance deployments use a Redis-backed solution.
 *
 * @module rate-limiter
 * @see checkRateLimit
 * @see getClientIP
 * @see rateLimits
 */

interface RateLimitEntry {
    count: number
    resetTime: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

// Clean up expired entries periodically
setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of rateLimitStore.entries()) {
        if (entry.resetTime < now) {
            rateLimitStore.delete(key)
        }
    }
}, 60000) // Clean up every minute

interface RateLimitOptions {
    /** Maximum number of requests allowed in the window */
    maxRequests: number
    /** Time window in milliseconds */
    windowMs: number
}

interface RateLimitResult {
    allowed: boolean
    remaining: number
    resetTime: number
}

/**
 * Check if a request should be rate limited
 * @param identifier - Unique identifier (e.g., IP address, user ID)
 * @param options - Rate limit configuration
 */
export function checkRateLimit(
    identifier: string,
    options: RateLimitOptions
): RateLimitResult {
    const { maxRequests, windowMs } = options
    const now = Date.now()
    const key = identifier

    const existing = rateLimitStore.get(key)

    if (!existing || existing.resetTime < now) {
        // Start new window
        const entry: RateLimitEntry = {
            count: 1,
            resetTime: now + windowMs
        }
        rateLimitStore.set(key, entry)
        return {
            allowed: true,
            remaining: maxRequests - 1,
            resetTime: entry.resetTime
        }
    }

    // Existing window
    if (existing.count >= maxRequests) {
        return {
            allowed: false,
            remaining: 0,
            resetTime: existing.resetTime
        }
    }

    existing.count++
    return {
        allowed: true,
        remaining: maxRequests - existing.count,
        resetTime: existing.resetTime
    }
}

/**
 * Get client IP from request
 * Handles proxies (Vercel, Cloudflare, etc.)
 */
export function getClientIP(request: Request): string {
    // Try various headers used by different hosting platforms
    const headers = new Headers(request.headers)

    // Vercel / generic proxy
    const forwardedFor = headers.get('x-forwarded-for')
    if (forwardedFor) {
        return forwardedFor.split(',')[0].trim()
    }

    // Cloudflare
    const cfConnecting = headers.get('cf-connecting-ip')
    if (cfConnecting) {
        return cfConnecting
    }

    // Real IP header
    const realIP = headers.get('x-real-ip')
    if (realIP) {
        return realIP
    }

    // Fallback
    return 'unknown'
}

/**
 * Pre-configured rate limiters for common use cases
 */
export const rateLimits = {
    /** Auth endpoints: 5 requests per minute */
    auth: { maxRequests: 5, windowMs: 60 * 1000 },
    /** User creation: 10 requests per minute */
    userCreation: { maxRequests: 10, windowMs: 60 * 1000 },
    /** Password reset: 3 requests per 5 minutes */
    passwordReset: { maxRequests: 3, windowMs: 5 * 60 * 1000 },
    /** General API: 100 requests per minute */
    general: { maxRequests: 100, windowMs: 60 * 1000 },
}
