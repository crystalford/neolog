'use client'

import { useState, useEffect } from 'react'
import { Globe, CheckCircle2, AlertCircle, Loader2, ExternalLink, Copy, Check } from 'lucide-react'

interface DomainSettingsProps {
    publicationId: string
    currentDomain?: string | null
    isVerified?: boolean
}

export function DomainSettings({ publicationId, currentDomain, isVerified }: DomainSettingsProps) {
    const [domain, setDomain] = useState('')
    const [loading, setLoading] = useState(false)
    const [verifying, setVerifying] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [showDNS, setShowDNS] = useState(false)
    const [dnsInstructions, setDnsInstructions] = useState<any>(null)
    const [copiedField, setCopiedField] = useState<string | null>(null)

    const handleAddDomain = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setSuccess(null)
        setLoading(true)

        try {
            const response = await fetch('/api/domains/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain, publicationId }),
            })

            const data = await response.json()

            if (!response.ok) {
                setError(data.error || 'Failed to add domain')
                setLoading(false)
                return
            }

            setDnsInstructions(data.dnsInstructions)
            setShowDNS(true)
            setSuccess('Domain added! Please configure your DNS.')
            setDomain('')
        } catch (err) {
            setError('Network error. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    const handleVerifyDomain = async () => {
        setError(null)
        setVerifying(true)

        try {
            const response = await fetch('/api/domains/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ publicationId }),
            })

            const data = await response.json()

            if (data.verified) {
                setSuccess('Domain verified successfully! 🎉')
                setShowDNS(false)
                // Refresh page to show updated status
                window.location.reload()
            } else {
                setError(data.message || 'Domain not verified yet. Please check your DNS settings.')
            }
        } catch (err) {
            setError('Failed to verify domain. Please try again.')
        } finally {
            setVerifying(false)
        }
    }

    const handleRemoveDomain = async () => {
        if (!confirm('Are you sure you want to remove this custom domain?')) {
            return
        }

        setLoading(true)
        setError(null)

        try {
            const response = await fetch('/api/domains/remove', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ publicationId }),
            })

            const data = await response.json()

            if (response.ok) {
                setSuccess('Domain removed successfully')
                // Refresh page
                window.location.reload()
            } else {
                setError(data.error || 'Failed to remove domain')
            }
        } catch (err) {
            setError('Network error. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    const copyToClipboard = (text: string, field: string) => {
        navigator.clipboard.writeText(text)
        setCopiedField(field)
        setTimeout(() => setCopiedField(null), 2000)
    }

    return (
        <div className="space-y-6">
            <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-[var(--accent)]/10 flex items-center justify-center flex-shrink-0">
                    <Globe size={24} className="text-[var(--accent)]" />
                </div>
                <div className="flex-1">
                    <h3 className="font-display text-xl mb-1">Custom Domain</h3>
                    <p className="text-sm text-[var(--text-secondary)]">
                        Use your own domain instead of username.neolog.com
                    </p>
                </div>
            </div>

            {error && (
                <div className="p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3">
                    <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{error}</p>
                </div>
            )}

            {success && (
                <div className="p-4 rounded-lg bg-green-50 border border-green-200 flex items-start gap-3">
                    <CheckCircle2 size={18} className="text-green-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-green-700">{success}</p>
                </div>
            )}

            {currentDomain ? (
                <div className="p-6 rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)]">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <p className="text-sm text-[var(--text-tertiary)] mb-1">Current Domain</p>
                            <p className="font-mono text-lg">{currentDomain}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {isVerified ? (
                                <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-medium flex items-center gap-1">
                                    <CheckCircle2 size={14} />
                                    Verified
                                </span>
                            ) : (
                                <span className="px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 text-sm font-medium flex items-center gap-1">
                                    <AlertCircle size={14} />
                                    Pending
                                </span>
                            )}
                        </div>
                    </div>

                    {!isVerified && (
                        <div className="mb-4 p-4 rounded-lg bg-yellow-50 border border-yellow-200">
                            <p className="text-sm text-yellow-800 mb-3">
                                Your domain is not verified yet. Please configure your DNS settings.
                            </p>
                            <button
                                onClick={() => setShowDNS(!showDNS)}
                                className="text-sm text-[var(--accent)] hover:underline"
                            >
                                {showDNS ? 'Hide' : 'Show'} DNS instructions
                            </button>
                        </div>
                    )}

                    {showDNS && dnsInstructions && (
                        <div className="mb-4 p-4 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-light)]">
                            <h4 className="font-semibold mb-3">DNS Configuration</h4>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between items-center">
                                    <span className="text-[var(--text-tertiary)]">Type:</span>
                                    <span className="font-mono">{dnsInstructions.type}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[var(--text-tertiary)]">Name:</span>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono">{dnsInstructions.name}</span>
                                        <button
                                            onClick={() => copyToClipboard(dnsInstructions.name, 'name')}
                                            className="p-1 hover:bg-[var(--bg-secondary)] rounded"
                                        >
                                            {copiedField === 'name' ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                                        </button>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[var(--text-tertiary)]">Value:</span>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono">{dnsInstructions.value}</span>
                                        <button
                                            onClick={() => copyToClipboard(dnsInstructions.value, 'value')}
                                            className="p-1 hover:bg-[var(--bg-secondary)] rounded"
                                        >
                                            {copiedField === 'value' ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                                        </button>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[var(--text-tertiary)]">TTL:</span>
                                    <span className="font-mono">{dnsInstructions.ttl}</span>
                                </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-[var(--border-light)]">
                                <p className="text-xs text-[var(--text-tertiary)] mb-2">Need help?</p>
                                <div className="flex gap-2">
                                    <a href="https://www.godaddy.com/help/add-a-cname-record-19236" target="_blank" rel="noopener" className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1">
                                        GoDaddy <ExternalLink size={12} />
                                    </a>
                                    <a href="https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/" target="_blank" rel="noopener" className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1">
                                        Cloudflare <ExternalLink size={12} />
                                    </a>
                                    <a href="https://support.google.com/domains/answer/9211383" target="_blank" rel="noopener" className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1">
                                        Google Domains <ExternalLink size={12} />
                                    </a>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-3">
                        {!isVerified && (
                            <button
                                onClick={handleVerifyDomain}
                                disabled={verifying}
                                className="btn btn-primary"
                            >
                                {verifying ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        Verifying...
                                    </>
                                ) : (
                                    'Verify Domain'
                                )}
                            </button>
                        )}
                        <button
                            onClick={handleRemoveDomain}
                            disabled={loading}
                            className="btn btn-secondary text-red-600 hover:bg-red-50"
                        >
                            Remove Domain
                        </button>
                    </div>
                </div>
            ) : (
                <form onSubmit={handleAddDomain} className="space-y-4">
                    <div>
                        <label htmlFor="domain" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                            Domain Name
                        </label>
                        <input
                            id="domain"
                            type="text"
                            value={domain}
                            onChange={(e) => setDomain(e.target.value)}
                            placeholder="blog.example.com"
                            className="input"
                            required
                        />
                        <p className="text-xs text-[var(--text-tertiary)] mt-2">
                            Enter your custom domain (e.g., blog.example.com)
                        </p>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn btn-primary"
                    >
                        {loading ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Adding Domain...
                            </>
                        ) : (
                            'Add Custom Domain'
                        )}
                    </button>
                </form>
            )}
        </div>
    )
}
