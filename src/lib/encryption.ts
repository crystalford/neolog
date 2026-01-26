/**
 * Encryption utilities for API keys
 * Uses simple base64 encoding for now
 * TODO: Implement proper encryption with a server-side secret
 */

/**
 * "Encrypt" an API key (currently just base64)
 */
export function encryptApiKey(key: string): string {
    return Buffer.from(key).toString('base64')
}

/**
 * "Decrypt" an API key (currently just base64)
 */
export function decryptApiKey(encryptedKey: string): string {
    return Buffer.from(encryptedKey, 'base64').toString('utf-8')
}

/**
 * Mask an API key for display (show first 8 chars only)
 */
export function maskApiKey(key: string): string {
    if (key.length <= 12) {
        return '•'.repeat(key.length)
    }
    return `${key.substring(0, 8)}${'•'.repeat(Math.min(key.length - 8, 20))}`
}
