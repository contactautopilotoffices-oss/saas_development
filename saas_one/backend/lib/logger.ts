/**
 * Production-Safe Logger Utility
 *
 * Purpose: Centralized, sanitized logging for the entire application.
 * Ensures sensitive data (passwords, API keys, tokens) is never leaked in logs.
 *
 * Why this matters:
 *   - In production, console.log statements can expose sensitive environment
 *     variables, user data, and API credentials.
 *   - This module redacts any field whose key contains sensitive keywords.
 *   - Debug/info logs are suppressed in production (reduces log volume).
 *   - Warnings and errors are always logged (sanitized) for production monitoring.
 *
 * Usage:
 *   import { logger } from '@/backend/lib/logger';
 *   logger.info('User logged in', { userId: '123', role: 'admin' });  // safe
 *   logger.debug('Token refresh', { token: 'secret' });               // redacted
 *
 * Sensitive keywords filtered:
 *   password, secret, token, key, authorization, cookie, session,
 *   credential, api_key, service_role, anon_key, temp_password
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

// Only enable verbose logging in development
// In production, debug/info are suppressed to avoid exposing sensitive data in logs
const isDevelopment = process.env.NODE_ENV !== 'production'

/**
 * Recursively sanitize data to prevent sensitive information from being logged.
 *
 * What it does:
 *   - Scans all object keys (case-insensitive) for sensitive keyword matches.
 *   - Replaces matching values with '[REDACTED]'.
 *   - Recursively sanitizes nested objects and arrays.
 *
 * Why: A naive JSON.stringify of a request body containing { password: "secret123" }
 * would print the password in plain text. This prevents that entirely.
 *
 * @param data - Any value to sanitize (object, array, primitive, null, undefined)
 * @returns The sanitized copy with sensitive values replaced
 */
function sanitize(data: unknown): unknown {
    if (data === null || data === undefined) return data
    if (typeof data !== 'object') return data

    // List of key names that indicate sensitive data — case-insensitive match
    const sensitiveKeys = [
        'password', 'secret', 'token', 'key', 'authorization',
        'cookie', 'session', 'credential', 'api_key', 'apikey',
        'service_role', 'anon_key', 'temp_password'
    ]

    if (Array.isArray(data)) {
        return data.map(item => sanitize(item)) // Recurse into arrays
    }

    const sanitized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        const lowerKey = key.toLowerCase()
        // If any sensitive keyword appears in the key name, redact the value
        if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
            sanitized[key] = '[REDACTED]'
        } else if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitize(value) // Recurse into nested objects
        } else {
            sanitized[key] = value
        }
    }
    return sanitized
}

/**
 * Format a log message with ISO timestamp and log level.
 *
 * @param level   - Log level (debug, info, warn, error)
 * @param message - Human-readable log message
 * @param data    - Optional structured data to log alongside the message
 * @returns Formatted string: "[2026-04-08T12:00:00.000Z] [INFO] message {data}"
 */
function formatMessage(level: LogLevel, message: string, data?: unknown): string {
    const timestamp = new Date().toISOString()
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`
    if (data !== undefined) {
        return `${prefix} ${message} ${JSON.stringify(sanitize(data))}`
    }
    return `${prefix} ${message}`
}

export const logger = {
    /**
     * Debug-level logs — development only.
     * Use for: tracing variable values, function entry/exit, detailed flow.
     * What it does: Only prints in non-production environments.
     */
    debug(message: string, data?: unknown): void {
        if (isDevelopment) {
            console.log(formatMessage('debug', message, data))
        }
    },

    /**
     * Info-level logs — development only.
     * Use for: business events (user signed up, ticket created, email sent).
     * What it does: Only prints in non-production environments.
     */
    info(message: string, data?: unknown): void {
        if (isDevelopment) {
            console.info(formatMessage('info', message, data))
        }
    },

    /**
     * Warning logs — always logged (production-safe).
     * Use for: non-fatal issues that deserve attention (deprecated API used,
     * missing optional config, rate limit approaching).
     * What it does: Always prints, but sanitizes data to remove secrets.
     */
    warn(message: string, data?: unknown): void {
        console.warn(formatMessage('warn', message, data))
    },

    /**
     * Error logs — always logged (production-safe).
     * Use for: exceptions, failed operations, infrastructure errors.
     * What it does: Always prints. In development includes stack traces;
     * in production stack traces are omitted to reduce log size.
     */
    error(message: string, error?: unknown): void {
        if (error instanceof Error) {
            console.error(formatMessage('error', message, {
                name: error.name,
                message: error.message,
                // Include full stack trace only in development for easier debugging
                ...(isDevelopment ? { stack: error.stack } : {})
            }))
        } else {
            console.error(formatMessage('error', message, sanitize(error)))
        }
    }
}

export default logger
