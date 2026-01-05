'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  onSelectedPublicationIdChange,
  readSelectedPublicationId,
} from '@/lib/publicationContext'
import { 
  ArrowLeft, Plus, Users, DollarSign, Link as LinkIcon,
  Copy, Check, Loader2, ExternalLink, Trash2
} from 'lucide-react'

type ReferralProgram = {
  id: string
  creator_id: string
  bounty_cents: number
  monthly_budget_cents: number | null
  spent_this_month_cents: number
  target_minimum_curator_score: number
  is_active: boolean
  created_at: string
}

type ReferralLink = {
  id: string
  code: string
  clicks: number
  signups: number
  program: ReferralProgram
}

type AvailableProgram = {
  id: string
  bounty_cents: number
  creator: {
    username: string
    display_name: string | null
  }
}

export default function ReferralsPage() {
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [myProgram, setMyProgram] = useState<ReferralProgram | null>(null)
  const [myLinks, setMyLinks] = useState<ReferralLink[]>([])
  const [availablePrograms, setAvailablePrograms] = useState<AvailableProgram[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [tab, setTab] = useState<'my-program' | 'earn'>('my-program')
  
  // New program form
  const [bounty, setBounty] = useState(2)
  const [monthlyBudget, setMonthlyBudget] = useState<number | null>(null)
  const [minCuratorScore, setMinCuratorScore] = useState(0)
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadData()

    const unsubscribe = onSelectedPublicationIdChange(() => {
      loadData()
    })

    return unsubscribe
  }, [])

  const loadData = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }

    const selectedPublicationId = readSelectedPublicationId()

    // Load my program
    let programQuery = supabase
      .from('referral_programs')
      .select('*')
      .eq('creator_id', session.user.id)

    if (selectedPublicationId) {
      programQuery = programQuery.or(
        `publication_id.eq.${selectedPublicationId},publication_id.is.null`
      )
    }

    const { data: program } = await programQuery
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (program) {
      setMyProgram(program)
    }

    // Load my referral links (programs I'm promoting)
    let linksQuery = supabase
      .from('referral_links')
      .select(
        selectedPublicationId
          ? `*, program:referral_programs!inner(*)`
          : `*, program:referral_programs(*)`
      )
      .eq('referrer_id', session.user.id)

    if (selectedPublicationId) {
      linksQuery = linksQuery.or(
        `publication_id.eq.${selectedPublicationId},publication_id.is.null`,
        { foreignTable: 'program' }
      )
    }

    const { data: links } = await linksQuery

    if (links) {
      setMyLinks(links)
    }

    // Load available programs to join
    let availableQuery = supabase
      .from('referral_programs')
      .select(`
        id,
        bounty_cents,
        creator:profiles(username, display_name)
      `)
      .eq('is_active', true)
      .neq('creator_id', session.user.id)
      .limit(20)

    if (selectedPublicationId) {
      availableQuery = availableQuery.or(
        `publication_id.eq.${selectedPublicationId},publication_id.is.null`
      )
    }

    const { data: programs } = await availableQuery

    if (programs) {
      setAvailablePrograms(programs as any)
    }

    setLoading(false)
  }

  const createProgram = async () => {
    setCreating(true)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }

    const selectedPublicationId = readSelectedPublicationId()

    const { data, error } = await supabase
      .from('referral_programs')
      .insert({
        creator_id: session.user.id,
        publication_id: selectedPublicationId,
        bounty_cents: Math.round(bounty * 100),
        monthly_budget_cents: monthlyBudget ? Math.round(monthlyBudget * 100) : null,
        target_minimum_curator_score: minCuratorScore,
        is_active: true,
      })
      .select()
      .single()

    if (!error && data) {
      setMyProgram(data)
      setShowCreateModal(false)
    }

    setCreating(false)
  }

  const joinProgram = async (programId: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    // Generate unique code
    const code = `ref_${session.user.id.slice(0, 8)}_${programId.slice(0, 8)}`

    const { data, error } = await supabase
      .from('referral_links')
      .insert({
        referrer_id: session.user.id,
        program_id: programId,
        code,
      })
      .select(`
        *,
        program:referral_programs(*)
      `)
      .single()

    if (!error && data) {
      setMyLinks([...myLinks, data])
      setAvailablePrograms(availablePrograms.filter(p => p.id !== programId))
    }
  }

  const copyLink = (code: string) => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://neolog.ai'
    navigator.clipboard.writeText(`${baseUrl}?ref=${code}`)
    setCopied(code)
    setTimeout(() => setCopied(null), 2000)
  }

  const toggleProgram = async () => {
    if (!myProgram) return

    await supabase
      .from('referral_programs')
      .update({ is_active: !myProgram.is_active })
      .eq('id', myProgram.id)

    setMyProgram({ ...myProgram, is_active: !myProgram.is_active })
  }

  const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`

  return (
    <>
      <main className="pt-16 pb-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          {/* Header */}
          <div className="flex items-center gap-4 pt-8 mb-8">
            <Link 
              href="/boost"
              className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="font-display text-2xl">Referral Programs</h1>
              <p className="text-[var(--text-secondary)]">
                Grow your audience or earn by recommending others
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-[var(--bg-secondary)] rounded-lg mb-6 w-fit">
            <button
              onClick={() => setTab('my-program')}
              className={`px-4 py-2 text-sm rounded-md transition-all ${
                tab === 'my-program'
                  ? 'bg-[var(--bg-primary)] shadow-sm font-medium'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              My Program
            </button>
            <button
              onClick={() => setTab('earn')}
              className={`px-4 py-2 text-sm rounded-md transition-all ${
                tab === 'earn'
                  ? 'bg-[var(--bg-primary)] shadow-sm font-medium'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Earn by Referring
            </button>
          </div>

          {loading ? (
            <div className="space-y-4">
              <div className="h-32 skeleton rounded-xl" />
              <div className="h-24 skeleton rounded-xl" />
            </div>
          ) : tab === 'my-program' ? (
            // My Program Tab
            myProgram ? (
              <div className="space-y-6">
                <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="font-display text-xl">Your Referral Program</h2>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                          myProgram.is_active
                            ? 'bg-[var(--success)]/10 text-[var(--success)]'
                            : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]'
                        }`}>
                          {myProgram.is_active ? 'Active' : 'Paused'}
                        </span>
                      </div>
                      <p className="text-[var(--text-secondary)]">
                        Pay other creators to send you subscribers
                      </p>
                    </div>
                    <button
                      onClick={toggleProgram}
                      className="btn btn-secondary btn-sm"
                    >
                      {myProgram.is_active ? 'Pause' : 'Activate'}
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-[var(--text-tertiary)] mb-1">Bounty per subscriber</p>
                      <p className="font-mono text-lg">{formatCents(myProgram.bounty_cents)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text-tertiary)] mb-1">Monthly budget</p>
                      <p className="font-mono text-lg">
                        {myProgram.monthly_budget_cents 
                          ? formatCents(myProgram.monthly_budget_cents)
                          : 'Unlimited'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text-tertiary)] mb-1">Spent this month</p>
                      <p className="font-mono text-lg">{formatCents(myProgram.spent_this_month_cents)}</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/20">
                  <p className="text-sm">
                    <strong>How it works:</strong> Other creators share your profile link with their audience. 
                    When someone subscribes through their link, you pay them {formatCents(myProgram.bounty_cents)}.
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                <Users size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
                <h2 className="font-display text-xl mb-2">Start a Referral Program</h2>
                <p className="text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
                  Pay other creators to send you subscribers. Only pay when someone actually subscribes.
                </p>
                <button 
                  onClick={() => setShowCreateModal(true)}
                  className="btn btn-primary"
                >
                  <Plus size={16} />
                  Create Program
                </button>
              </div>
            )
          ) : (
            // Earn Tab
            <div className="space-y-6">
              {/* My referral links */}
              {myLinks.length > 0 && (
                <div>
                  <h2 className="font-display text-lg mb-4">Your Referral Links</h2>
                  <div className="space-y-3">
                    {myLinks.map((link) => (
                      <div 
                        key={link.id}
                        className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <p className="font-medium">
                            {(link.program as any)?.creator?.display_name || 'Unknown creator'}
                          </p>
                          <span className="font-mono text-sm text-[var(--accent)]">
                            {formatCents(link.program.bounty_cents)}/sub
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <code className="flex-1 px-3 py-2 bg-[var(--bg-tertiary)] rounded text-sm font-mono truncate">
                            {typeof window !== 'undefined' ? `${window.location.origin}?ref=${link.code}` : link.code}
                          </code>
                          <button
                            onClick={() => copyLink(link.code)}
                            className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
                          >
                            {copied === link.code ? (
                              <Check size={16} className="text-[var(--success)]" />
                            ) : (
                              <Copy size={16} className="text-[var(--text-tertiary)]" />
                            )}
                          </button>
                        </div>

                        <div className="flex items-center gap-4 mt-3 text-sm text-[var(--text-tertiary)]">
                          <span>{link.clicks} clicks</span>
                          <span>{link.signups} signups</span>
                          <span className="text-[var(--success)]">
                            Earned: {formatCents(link.signups * link.program.bounty_cents)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Available programs */}
              <div>
                <h2 className="font-display text-lg mb-4">Available Programs</h2>
                {availablePrograms.length === 0 ? (
                  <div className="text-center py-8 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                    <p className="text-[var(--text-secondary)]">
                      No programs available right now
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {availablePrograms.map((program) => (
                      <div 
                        key={program.id}
                        className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]"
                      >
                        <div>
                          <p className="font-medium">
                            {program.creator.display_name || program.creator.username}
                          </p>
                          <p className="text-sm text-[var(--text-tertiary)]">
                            @{program.creator.username}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-[var(--accent)]">
                            {formatCents(program.bounty_cents)}/sub
                          </span>
                          <button
                            onClick={() => joinProgram(program.id)}
                            className="btn btn-primary btn-sm"
                          >
                            <LinkIcon size={14} />
                            Get Link
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="relative bg-[var(--bg-primary)] rounded-2xl p-6 max-w-lg w-full">
            <h2 className="font-display text-xl mb-6">Create Referral Program</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Bounty per Subscriber</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]">$</span>
                  <input
                    type="number"
                    value={bounty}
                    onChange={(e) => setBounty(parseFloat(e.target.value) || 0)}
                    className="input pl-7"
                    min="0.50"
                    step="0.50"
                  />
                </div>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">
                  How much you pay for each new subscriber
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Monthly Budget (optional)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]">$</span>
                  <input
                    type="number"
                    value={monthlyBudget || ''}
                    onChange={(e) => setMonthlyBudget(e.target.value ? parseFloat(e.target.value) : null)}
                    className="input pl-7"
                    placeholder="Unlimited"
                    min="10"
                    step="10"
                  />
                </div>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">
                  Leave empty for unlimited
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Minimum Curator Score</label>
                <input
                  type="range"
                  value={minCuratorScore}
                  onChange={(e) => setMinCuratorScore(parseInt(e.target.value))}
                  className="w-full"
                  min="0"
                  max="90"
                  step="10"
                />
                <div className="flex justify-between text-xs text-[var(--text-tertiary)]">
                  <span>Anyone (0)</span>
                  <span>Current: {minCuratorScore}</span>
                  <span>Top curators (90)</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={createProgram}
                disabled={creating}
                className="btn btn-primary flex-1"
              >
                {creating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    Create Program
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}


