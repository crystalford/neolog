'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/Header'
import { 
  Rocket, Plus, Wallet, TrendingUp, Eye, 
  MousePointer, Users, DollarSign, ArrowRight,
  Pause, Play, Settings, BarChart3
} from 'lucide-react'

type Campaign = {
  id: string
  name: string
  post_id: string
  post?: { title: string; slug: string }
  objective: string
  daily_budget_cents: number
  total_budget_cents: number
  spent_cents: number
  bid_per_action_cents: number
  status: string
  impressions: number
  clicks: number
  conversions: number
  created_at: string
}

type WalletData = {
  balance_cents: number
  pending_cents: number
  earned_cents: number
}

export default function BoostPage() {
  const [loading, setLoading] = useState(true)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [wallet, setWallet] = useState<WalletData | null>(null)
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }

    const { data: campaignsData } = await supabase
      .from('boost_campaigns')
      .select(`
        *,
        post:posts(title, slug)
      `)
      .eq('advertiser_id', session.user.id)
      .order('created_at', { ascending: false })

    if (campaignsData) {
      setCampaigns(campaignsData)
    }

    const { data: walletData } = await supabase
      .from('boost_wallets')
      .select('*')
      .eq('user_id', session.user.id)
      .single()

    if (walletData) {
      setWallet(walletData)
    } else {
      setWallet({ balance_cents: 0, pending_cents: 0, earned_cents: 0 })
    }

    setLoading(false)
  }

  const formatCents = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`
  }

  const toggleCampaignStatus = async (campaign: Campaign) => {
    const newStatus = campaign.status === 'active' ? 'paused' : 'active'
    
    await supabase
      .from('boost_campaigns')
      .update({ status: newStatus })
      .eq('id', campaign.id)

    setCampaigns(campaigns.map(c => 
      c.id === campaign.id ? { ...c, status: newStatus } : c
    ))
  }

  const getCTR = (clicks: number, impressions: number) => {
    if (impressions === 0) return '0%'
    return `${((clicks / impressions) * 100).toFixed(1)}%`
  }

  const getConversionRate = (conversions: number, clicks: number) => {
    if (clicks === 0) return '0%'
    return `${((conversions / clicks) * 100).toFixed(1)}%`
  }

  if (loading) {
    return (
      <>
        <Header />
        <main className="pt-16 pb-16">
          <div className="max-w-7xl mx-auto px-6 lg:px-12">
            <div className="space-y-4 pt-8">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-24 skeleton rounded-xl" />
              ))}
            </div>
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <Header />
      <main className="pt-16 pb-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="flex items-center justify-between pt-8 mb-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
                <Rocket size={24} className="text-[var(--accent)]" />
              </div>
              <div>
                <h1 className="font-display text-3xl">Boost</h1>
                <p className="text-[var(--text-secondary)]">
                  Grow your audience with creator-to-creator promotion
                </p>
              </div>
            </div>
            
            <Link href="/boost/new" className="btn btn-primary">
              <Plus size={16} />
              New Campaign
            </Link>
          </div>

          {wallet && (
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="p-5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet size={16} className="text-[var(--text-tertiary)]" />
                  <span className="text-sm text-[var(--text-secondary)]">Available Balance</span>
                </div>
                <p className="font-display text-2xl">{formatCents(wallet.balance_cents)}</p>
              </div>

              <div className="p-5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp size={16} className="text-[var(--text-tertiary)]" />
                  <span className="text-sm text-[var(--text-secondary)]">Reserved for Campaigns</span>
                </div>
                <p className="font-display text-2xl">{formatCents(wallet.pending_cents)}</p>
              </div>

              <div className="p-5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign size={16} className="text-[var(--success)]" />
                  <span className="text-sm text-[var(--text-secondary)]">Earned from Placements</span>
                </div>
                <p className="font-display text-2xl text-[var(--success)]">{formatCents(wallet.earned_cents)}</p>
              </div>
            </div>
          )}

          <div className="flex gap-1 p-1 bg-[var(--bg-secondary)] rounded-lg mb-6 w-fit">
            <div className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-[var(--bg-primary)] shadow-sm font-medium">
              <Rocket size={16} />
              My Campaigns
            </div>
            <Link
              href="/boost/placements"
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
            >
              <DollarSign size={16} />
              Sell Placements
            </Link>
            <Link
              href="/boost/referrals"
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
            >
              <Users size={16} />
              Referral Programs
            </Link>
          </div>

          {campaigns.length === 0 ? (
            <div className="text-center py-16 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
              <Rocket size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
              <h2 className="font-display text-xl mb-2">No campaigns yet</h2>
              <p className="text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
                Create a boost campaign to promote your posts to readers across Neolog
              </p>
              <Link href="/boost/new" className="btn btn-primary">
                <Plus size={16} />
                Create Your First Campaign
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {campaigns.map((campaign) => (
                <div 
                  key={campaign.id}
                  className="p-5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium">{campaign.name}</h3>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                          campaign.status === 'active' 
                            ? 'bg-[var(--success)]/10 text-[var(--success)]'
                            : campaign.status === 'paused'
                            ? 'bg-[var(--warning)]/10 text-[var(--warning)]'
                            : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]'
                        }`}>
                          {campaign.status}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)]">
                        Promoting: {campaign.post?.title || 'Unknown post'}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleCampaignStatus(campaign)}
                        className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
                        title={campaign.status === 'active' ? 'Pause' : 'Resume'}
                      >
                        {campaign.status === 'active' ? (
                          <Pause size={16} className="text-[var(--text-tertiary)]" />
                        ) : (
                          <Play size={16} className="text-[var(--text-tertiary)]" />
                        )}
                      </button>
                      <Link
                        href={`/boost/${campaign.id}`}
                        className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
                      >
                        <Settings size={16} className="text-[var(--text-tertiary)]" />
                      </Link>
                    </div>
                  </div>

                  <div className="grid grid-cols-5 gap-4">
                    <div>
                      <p className="text-xs text-[var(--text-tertiary)] mb-1">Spent</p>
                      <p className="font-mono text-sm">
                        {formatCents(campaign.spent_cents)} / {formatCents(campaign.total_budget_cents)}
                      </p>
                      <div className="mt-1 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-[var(--accent)] rounded-full"
                          style={{ width: `${(campaign.spent_cents / campaign.total_budget_cents) * 100}%` }}
                        />
                      </div>
                    </div>
                    
                    <div>
                      <p className="text-xs text-[var(--text-tertiary)] mb-1">Impressions</p>
                      <p className="font-mono text-sm">{campaign.impressions.toLocaleString()}</p>
                    </div>
                    
                    <div>
                      <p className="text-xs text-[var(--text-tertiary)] mb-1">Clicks</p>
                      <p className="font-mono text-sm">{campaign.clicks.toLocaleString()}</p>
                      <p className="text-[10px] text-[var(--text-tertiary)]">
                        {getCTR(campaign.clicks, campaign.impressions)} CTR
                      </p>
                    </div>
                    
                    <div>
                      <p className="text-xs text-[var(--text-tertiary)] mb-1">Conversions</p>
                      <p className="font-mono text-sm">{campaign.conversions.toLocaleString()}</p>
                      <p className="text-[10px] text-[var(--text-tertiary)]">
                        {getConversionRate(campaign.conversions, campaign.clicks)} CVR
                      </p>
                    </div>
                    
                    <div>
                      <p className="text-xs text-[var(--text-tertiary)] mb-1">Cost per {campaign.objective.slice(0, -1)}</p>
                      <p className="font-mono text-sm">
                        {campaign.conversions > 0 
                          ? formatCents(Math.round(campaign.spent_cents / campaign.conversions))
                          : ' - '
                        }
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-12 p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
            <h2 className="font-display text-lg mb-4">How Boost works</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <div className="w-8 h-8 rounded-full bg-[var(--accent-soft)] flex items-center justify-center text-sm font-medium text-[var(--accent)] mb-3">
                  1
                </div>
                <h3 className="font-medium mb-1">Create a campaign</h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  Choose a post to promote, set your budget and bid per action.
                </p>
              </div>
              <div>
                <div className="w-8 h-8 rounded-full bg-[var(--accent-soft)] flex items-center justify-center text-sm font-medium text-[var(--accent)] mb-3">
                  2
                </div>
                <h3 className="font-medium mb-1">Reach new readers</h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  Your post appears in feeds of other creators who opted in.
                </p>
              </div>
              <div>
                <div className="w-8 h-8 rounded-full bg-[var(--accent-soft)] flex items-center justify-center text-sm font-medium text-[var(--accent)] mb-3">
                  3
                </div>
                <h3 className="font-medium mb-1">Pay for results</h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  You only pay when readers take action.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}

