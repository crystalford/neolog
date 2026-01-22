/**
 * Vercel API Integration for Custom Domains
 * 
 * Handles domain management via Vercel's API:
 * - Adding domains to the project
 * - Removing domains
 * - Checking domain status
 * - Verifying domain configuration
 */

const VERCEL_API_URL = 'https://api.vercel.com'

export interface VercelDomain {
    name: string
    verified: boolean
    verification?: {
        type: string
        domain: string
        value: string
        reason: string
    }[]
}

export interface DomainStatus {
    verified: boolean
    configured: boolean
    sslEnabled: boolean
    error?: string
}

/**
 * Add a domain to the Vercel project
 */
export async function addDomainToVercel(domain: string): Promise<VercelDomain> {
    const token = process.env.VERCEL_TOKEN
    const teamId = process.env.VERCEL_TEAM_ID
    const projectId = process.env.VERCEL_PROJECT_ID

    if (!token || !teamId || !projectId) {
        throw new Error('Missing Vercel configuration. Set VERCEL_TOKEN, VERCEL_TEAM_ID, and VERCEL_PROJECT_ID')
    }

    const response = await fetch(
        `${VERCEL_API_URL}/v9/projects/${projectId}/domains?teamId=${teamId}`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: domain }),
        }
    )

    if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error?.message || 'Failed to add domain to Vercel')
    }

    return response.json()
}

/**
 * Remove a domain from the Vercel project
 */
export async function removeDomainFromVercel(domain: string): Promise<void> {
    const token = process.env.VERCEL_TOKEN
    const teamId = process.env.VERCEL_TEAM_ID
    const projectId = process.env.VERCEL_PROJECT_ID

    if (!token || !teamId || !projectId) {
        throw new Error('Missing Vercel configuration')
    }

    const response = await fetch(
        `${VERCEL_API_URL}/v9/projects/${projectId}/domains/${domain}?teamId=${teamId}`,
        {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }
    )

    if (!response.ok && response.status !== 404) {
        const error = await response.json()
        throw new Error(error.error?.message || 'Failed to remove domain from Vercel')
    }
}

/**
 * Get domain status from Vercel
 */
export async function getDomainStatus(domain: string): Promise<DomainStatus> {
    const token = process.env.VERCEL_TOKEN
    const teamId = process.env.VERCEL_TEAM_ID
    const projectId = process.env.VERCEL_PROJECT_ID

    if (!token || !teamId || !projectId) {
        throw new Error('Missing Vercel configuration')
    }

    const response = await fetch(
        `${VERCEL_API_URL}/v9/projects/${projectId}/domains/${domain}?teamId=${teamId}`,
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }
    )

    if (!response.ok) {
        if (response.status === 404) {
            return {
                verified: false,
                configured: false,
                sslEnabled: false,
                error: 'Domain not found in Vercel',
            }
        }
        const error = await response.json()
        return {
            verified: false,
            configured: false,
            sslEnabled: false,
            error: error.error?.message || 'Failed to get domain status',
        }
    }

    const data: VercelDomain = await response.json()

    return {
        verified: data.verified,
        configured: data.verified,
        sslEnabled: data.verified, // SSL is auto-enabled when verified
        error: data.verification?.[0]?.reason,
    }
}

/**
 * Verify domain configuration
 */
export async function verifyDomain(domain: string): Promise<boolean> {
    const status = await getDomainStatus(domain)
    return status.verified
}

/**
 * Validate domain format
 */
export function isValidDomain(domain: string): boolean {
    // Basic domain validation
    const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i

    if (!domainRegex.test(domain)) {
        return false
    }

    // Block neolog.com subdomains
    if (domain.endsWith('.neolog.com') || domain === 'neolog.com') {
        return false
    }

    // Block localhost and common test domains
    const blocked = ['localhost', 'example.com', 'test.com', '127.0.0.1']
    if (blocked.some(b => domain.includes(b))) {
        return false
    }

    return true
}
