'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Gift, Copy, Check, TrendingUp, Users, DollarSign,
  Link as LinkIcon, Loader2, Award
} from 'lucide-react'

interface ReferralStats {
  totalReferrals: number
  activeReferrals: number
  totalEarnings: number
  pendingEarnings: number
}

interface ReferralLink {
  id: string
  code: string
  url: string
  clicks: number
  conversions: number
  created_at: string
}

export function ReferralSystem() {
  const [stats, setStats] = useState<ReferralStats>({
    totalReferrals: 0,
    activeReferrals: 0,
    totalEarnings: 0,
    pendingEarnings: 0,
  })
  const [links, setLinks] = useState<ReferralLink[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)
  const [creatingLink, setCreatingLink] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    loadReferralData()
  }, [])

  const loadReferralData = async () => {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // Load referral links
      const { data: linksData } = await supabase
        .from('referral_links')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })

      if (linksData) {
        setLinks(linksData.map(link => ({
          ...link,
          url: `${window.location.origin}?ref=${link.code}`,
        })))
      }

      // Load conversion stats
      const { data: conversions } = await supabase
        .from('referral_conversions')
        .select('*, referral_link:referral_links!inner(user_id)')
        .eq('referral_links.user_id', session.user.id)

      if (conversions) {
        const totalReferrals = conversions.length
        const activeReferrals = conversions.filter(c => c.status === 'active').length

        // Calculate earnings (mock data - would come from actual payment system)
        const totalEarnings = conversions
          .filter(c => c.status === 'paid')
          .reduce((sum, c) => sum + (c.commission_amount || 0), 0)

        const pendingEarnings = conversions
          .filter(c => c.status === 'pending')
          .reduce((sum, c) => sum + (c.commission_amount || 0), 0)

        setStats({
          totalReferrals,
          activeReferrals,
          totalEarnings,
          pendingEarnings,
        })
      }
    } catch (error) {
      console.error('Error loading referral data:', error)
    } finally {
      setLoading(false)
    }
  }

  const createReferralLink = async () => {
    setCreatingLink(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // Generate unique code
      const code = Math.random().toString(36).substring(2, 10)

      const { data, error } = await supabase
        .from('referral_links')
        .insert({
          user_id: session.user.id,
          code,
        })
        .select()
        .single()

      if (error) throw error

      if (data) {
        setLinks([
          {
            ...data,
            url: `${window.location.origin}?ref=${data.code}`,
          },
          ...links,
        ])
      }
    } catch (error) {
      console.error('Error creating referral link:', error)
      alert('Failed to create referral link')
    } finally {
      setCreatingLink(false)
    }
  }

  const copyToClipboard = async (link: ReferralLink) => {
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(link.id)
      setTimeout(() => setCopied(null), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-[var(--accent)]" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-3">
            <Gift size={32} className="text-[var(--accent)]" />
            Referral Program
          </h1>
          <p className="text-[var(--text-secondary)] mt-2">
            Earn rewards by inviting others to join Neolog
          </p>
        </div>
        <button
          onClick={createReferralLink}
          disabled={creatingLink}
          className="btn btn-primary"
        >
          {creatingLink ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <LinkIcon size={16} />
              New Link
            </>
          )}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Users size={20} className="text-blue-500" />
            </div>
            <span className="text-sm text-[var(--text-tertiary)]">Total Referrals</span>
          </div>
          <p className="text-3xl font-display font-bold">
            {stats.totalReferrals}
          </p>
        </div>

        <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <TrendingUp size={20} className="text-green-500" />
            </div>
            <span className="text-sm text-[var(--text-tertiary)]">Active</span>
          </div>
          <p className="text-3xl font-display font-bold">
            {stats.activeReferrals}
          </p>
        </div>

        <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <DollarSign size={20} className="text-purple-500" />
            </div>
            <span className="text-sm text-[var(--text-tertiary)]">Total Earned</span>
          </div>
          <p className="text-3xl font-display font-bold">
            ${stats.totalEarnings.toFixed(2)}
          </p>
        </div>

        <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <Award size={20} className="text-orange-500" />
            </div>
            <span className="text-sm text-[var(--text-tertiary)]">Pending</span>
          </div>
          <p className="text-3xl font-display font-bold">
            ${stats.pendingEarnings.toFixed(2)}
          </p>
        </div>
      </div>

      {/* How it works */}
      <div className="p-8 rounded-xl bg-gradient-to-br from-[var(--accent-soft)] to-transparent border border-[var(--accent)]/20">
        <h3 className="font-semibold text-lg mb-4">How It Works</h3>
        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <div className="w-8 h-8 rounded-full bg-[var(--accent)] text-white flex items-center justify-center font-bold mb-3">
              1
            </div>
            <h4 className="font-medium mb-2">Share Your Link</h4>
            <p className="text-sm text-[var(--text-secondary)]">
              Create a unique referral link and share it with your audience
            </p>
          </div>
          <div>
            <div className="w-8 h-8 rounded-full bg-[var(--accent)] text-white flex items-center justify-center font-bold mb-3">
              2
            </div>
            <h4 className="font-medium mb-2">They Sign Up</h4>
            <p className="text-sm text-[var(--text-secondary)]">
              When someone signs up using your link, they become your referral
            </p>
          </div>
          <div>
            <div className="w-8 h-8 rounded-full bg-[var(--accent)] text-white flex items-center justify-center font-bold mb-3">
              3
            </div>
            <h4 className="font-medium mb-2">Earn Rewards</h4>
            <p className="text-sm text-[var(--text-secondary)]">
              Get 20% commission on their subscription for 12 months
            </p>
          </div>
        </div>
      </div>

      {/* Referral links */}
      <div>
        <h3 className="font-semibold text-lg mb-4">Your Referral Links</h3>
        {links.length === 0 ? (
          <div className="text-center py-12 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-light)]">
            <LinkIcon size={48} className="mx-auto mb-4 text-[var(--text-tertiary)] opacity-50" />
            <p className="text-[var(--text-secondary)] mb-4">
              No referral links yet
            </p>
            <button onClick={createReferralLink} className="btn btn-primary">
              Create Your First Link
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {links.map(link => (
              <div
                key={link.id}
                className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-all"
              >
                <div className="flex-1 min-w-0 mr-4">
                  <div className="flex items-center gap-3 mb-2">
                    <code className="text-sm font-mono px-2 py-1 rounded bg-[var(--bg-tertiary)]">
                      {link.code}
                    </code>
                    <span className="text-xs text-[var(--text-tertiary)]">
                      Created {new Date(link.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] truncate">
                    {link.url}
                  </p>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <p className="text-2xl font-bold">{link.clicks || 0}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">Clicks</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-[var(--accent)]">
                      {link.conversions || 0}
                    </p>
                    <p className="text-xs text-[var(--text-tertiary)]">Signups</p>
                  </div>
                  <button
                    onClick={() => copyToClipboard(link)}
                    className="btn btn-secondary btn-sm"
                  >
                    {copied === link.id ? (
                      <>
                        <Check size={14} />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        Copy
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
