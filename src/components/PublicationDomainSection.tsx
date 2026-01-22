'use client'

import { useState, useEffect } from 'react'
import { DomainSettings } from '@/components/DomainSettings'
import { Loader2 } from 'lucide-react'

export function PublicationDomainSection() {
    const [publication, setPublication] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadPublication()
    }, [])

    const loadPublication = async () => {
        try {
            const response = await fetch('/api/publication/get')
            if (response.ok) {
                const data = await response.json()
                setPublication(data.publication)
            }
        } catch (error) {
            console.error('Failed to load publication:', error)
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 size={24} className="animate-spin text-[var(--text-tertiary)]" />
            </div>
        )
    }

    if (!publication) {
        return (
            <div className="p-6 rounded-lg bg-yellow-50 border border-yellow-200">
                <p className="text-sm text-yellow-800">
                    No publication found. Please contact support.
                </p>
            </div>
        )
    }

    return (
        <DomainSettings
            publicationId={publication.id}
            currentDomain={publication.custom_domain}
            isVerified={publication.domain_verified}
        />
    )
}
