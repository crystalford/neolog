'use client'export const runtime = 'edge'


import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  onSelectedPublicationIdChange,
  readSelectedPublicationId,
} from '@/lib/publicationContext'
import { 
  ArrowLeft, ArrowRight, Rocket, Target, DollarSign,
  Users, MousePointer, BookOpen, Check, Loader2,
  AlertCircle
} from 'lucide-react'

type Post = {
  id: string
  title: string
  slug: string
  published_at: string
}

type Step = 'post' | 'objective' | 'budget' | 'targeting' | 'review'

const STEPS: Step[] = ['post', 'objective', 'budget', 'targeting', 'review']

const OBJECTIVES = [
  {
    id: 'subscribers',
    label: 'Get Subscribers',
    description: 'Pay when someone subscribes to your publication',
    icon: Users,
    suggestedBid: 200, // $2.00
  },
  {
    id: 'reads',
    label: 'Get Qualified Reads',
    description: 'Pay when someone reads 75%+ of your post',
    icon: BookOpen,
    suggestedBid: 50, // $0.50
  },
  {
    id: 'clicks',
    label: 'Get Clicks',
    description: 'Pay when someone clicks through to your post',
    icon: MousePointer,
    suggestedBid: 25, // $0.25
  },
]

const TOPICS = [
  'technology', 'ai', 'writing', 'business', 'startups',
  'science', 'health', 'finance', 'crypto', 'design',
  'politics', 'culture', 'philosophy', 'productivity', 'marketing'
]

export default function NewCampaignPage() {
  const [step, setStep] = useState<Step>('post')
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Form state
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [objective, setObjective] = useState<string>('subscribers')
  const [campaignName, setCampaignName] = useState('')
  const [dailyBudget, setDailyBudget] = useState(10) // $10
  const [totalBudget, setTotalBudget] = useState(100) // $100
  const [bidAmount, setBidAmount] = useState(2) // $2
  const [selectedTopics, setSelectedTopics] = useState<string[]>([])
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadPosts()

    const unsubscribe = onSelectedPublicationIdChange(() => {
      setSelectedPost(null)
      setCampaignName('')
      setStep('post')
      loadPosts()
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    // Update suggested bid when objective changes
    const obj = OBJECTIVES.find(o => o.id === objective)
    if (obj) {
      setBidAmount(obj.suggestedBid / 100)
    }
  }, [objective])

  useEffect(() => {
    // Auto-generate campaign name
    if (selectedPost && !campaignName) {
      setCampaignName(`Boost: ${selectedPost.title.slice(0, 40)}${selectedPost.title.length > 40 ? '...' : ''}`)
    }
  }, [selectedPost])

  const loadPosts = async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }

    const selectedPublicationId = readSelectedPublicationId()

    const postsQuery = supabase
      .from('posts')
      .select('id, title, slug, published_at')
      .eq('author_id', session.user.id)
      .eq('status', 'published')
      .order('published_at', { ascending: false })

    if (selectedPublicationId) {
      postsQuery.eq('publication_id', selectedPublicationId)
    }

    const { data } = await postsQuery

    if (data) {
      setPosts(data)
    }
    setLoading(false)
  }

  const currentStepIndex = STEPS.indexOf(step)
  const canGoBack = currentStepIndex > 0
  const canGoForward = () => {
    switch (step) {
      case 'post': return selectedPost !== null
      case 'objective': return objective !== ''
      case 'budget': return dailyBudget > 0 && totalBudget > 0 && bidAmount > 0
      case 'targeting': return true // Optional
      case 'review': return true
      default: return false
    }
  }

  const goBack = () => {
    if (canGoBack) {
      setStep(STEPS[currentStepIndex - 1])
    }
  }

  const goForward = () => {
    if (step === 'review') {
      createCampaign()
    } else if (canGoForward()) {
      setStep(STEPS[currentStepIndex + 1])
    }
  }

  const createCampaign = async () => {
    if (!selectedPost) return
    
    setCreating(true)
    setError(null)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }

    // Check wallet balance
    const { data: wallet } = await supabase
      .from('boost_wallets')
      .select('balance_cents')
      .eq('user_id', session.user.id)
      .single()

    const totalBudgetCents = Math.round(totalBudget * 100)
    
    if (!wallet || wallet.balance_cents < totalBudgetCents) {
      setError(`Insufficient balance. You need $${totalBudget.toFixed(2)} but have $${((wallet?.balance_cents || 0) / 100).toFixed(2)}. Add funds first.`)
      setCreating(false)
      return
    }

    // Create campaign
    const { data: campaign, error: createError } = await supabase
      .from('boost_campaigns')
      .insert({
        advertiser_id: session.user.id,
        post_id: selectedPost.id,
        name: campaignName,
        objective,
        daily_budget_cents: Math.round(dailyBudget * 100),
        total_budget_cents: totalBudgetCents,
        bid_per_action_cents: Math.round(bidAmount * 100),
        target_topics: selectedTopics.length > 0 ? selectedTopics : null,
        status: 'active',
      })
      .select()
      .single()

    if (createError) {
      setError(createError.message)
      setCreating(false)
      return
    }

    // Reserve funds from wallet
    await supabase.rpc('reserve_boost_funds', {
      p_user_id: session.user.id,
      p_amount_cents: totalBudgetCents,
      p_campaign_id: campaign.id,
    })

    router.push('/boost')
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <>
      <main className="px-6 lg:px-12 py-10 max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <Link 
              href="/dashboard/boost"
              className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="font-display text-2xl">New Campaign</h1>
              <p className="text-[var(--text-secondary)]">
                Step {currentStepIndex + 1} of {STEPS.length}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="flex gap-1 mb-8">
            {STEPS.map((s, i) => (
              <div 
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i <= currentStepIndex ? 'bg-[var(--accent)]' : 'bg-[var(--bg-tertiary)]'
                }`}
              />
            ))}
          </div>

          {/* Step content */}
          <div className="min-h-[400px]">
            {step === 'post' && (
              <div>
                <h2 className="font-display text-xl mb-2">Select a post to promote</h2>
                <p className="text-[var(--text-secondary)] mb-6">
                  Choose one of your published posts to boost
                </p>

                {loading ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-20 skeleton rounded-xl" />
                    ))}
                  </div>
                ) : posts.length === 0 ? (
                  <div className="text-center py-12 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                    <p className="text-[var(--text-secondary)] mb-4">
                      You need to publish a post first
                    </p>
                    <Link href="/write" className="btn btn-primary">
                      Write a Post
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {posts.map((post) => (
                      <button
                        key={post.id}
                        onClick={() => setSelectedPost(post)}
                        className={`w-full text-left p-4 rounded-xl border transition-all ${
                          selectedPost?.id === post.id
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                            : 'border-[var(--border-light)] bg-[var(--bg-secondary)] hover:border-[var(--border-medium)]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-medium mb-1">{post.title}</h3>
                            <p className="text-sm text-[var(--text-tertiary)]">
                              Published {formatDate(post.published_at)}
                            </p>
                          </div>
                          {selectedPost?.id === post.id && (
                            <div className="w-6 h-6 rounded-full bg-[var(--accent)] flex items-center justify-center">
                              <Check size={14} className="text-white" />
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {step === 'objective' && (
              <div>
                <h2 className="font-display text-xl mb-2">Choose your objective</h2>
                <p className="text-[var(--text-secondary)] mb-6">
                  What do you want to achieve with this campaign?
                </p>

                <div className="space-y-3">
                  {OBJECTIVES.map((obj) => {
                    const Icon = obj.icon
                    return (
                      <button
                        key={obj.id}
                        onClick={() => setObjective(obj.id)}
                        className={`w-full text-left p-4 rounded-xl border transition-all ${
                          objective === obj.id
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                            : 'border-[var(--border-light)] bg-[var(--bg-secondary)] hover:border-[var(--border-medium)]'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            objective === obj.id ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-tertiary)]'
                          }`}>
                            <Icon size={20} />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-medium">{obj.label}</h3>
                            <p className="text-sm text-[var(--text-tertiary)]">
                              {obj.description}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-[var(--text-tertiary)]">Suggested bid</p>
                            <p className="font-mono font-medium">${(obj.suggestedBid / 100).toFixed(2)}</p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {step === 'budget' && (
              <div>
                <h2 className="font-display text-xl mb-2">Set your budget</h2>
                <p className="text-[var(--text-secondary)] mb-6">
                  Control how much you spend on this campaign
                </p>

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">Campaign Name</label>
                    <input
                      type="text"
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                      className="input"
                      placeholder="Enter a name for this campaign"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Daily Budget</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]">$</span>
                        <input
                          type="number"
                          value={dailyBudget}
                          onChange={(e) => setDailyBudget(parseFloat(e.target.value) || 0)}
                          className="input pl-7"
                          min="1"
                          step="1"
                        />
                      </div>
                      <p className="text-xs text-[var(--text-tertiary)] mt-1">
                        Max spend per day
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Total Budget</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]">$</span>
                        <input
                          type="number"
                          value={totalBudget}
                          onChange={(e) => setTotalBudget(parseFloat(e.target.value) || 0)}
                          className="input pl-7"
                          min="10"
                          step="10"
                        />
                      </div>
                      <p className="text-xs text-[var(--text-tertiary)] mt-1">
                        Campaign stops when reached
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Bid per {objective === 'subscribers' ? 'Subscriber' : objective === 'reads' ? 'Qualified Read' : 'Click'}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]">$</span>
                      <input
                        type="number"
                        value={bidAmount}
                        onChange={(e) => setBidAmount(parseFloat(e.target.value) || 0)}
                        className="input pl-7"
                        min="0.10"
                        step="0.10"
                      />
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">
                      Higher bids get more visibility
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                    <h3 className="font-medium mb-2">Estimated results</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-[var(--text-tertiary)]">Campaign duration</p>
                        <p className="font-mono">{Math.ceil(totalBudget / dailyBudget)} days</p>
                      </div>
                      <div>
                        <p className="text-[var(--text-tertiary)]">
                          Est. {objective === 'subscribers' ? 'subscribers' : objective === 'reads' ? 'reads' : 'clicks'}
                        </p>
                        <p className="font-mono">{Math.floor(totalBudget / bidAmount)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 'targeting' && (
              <div>
                <h2 className="font-display text-xl mb-2">Target your audience</h2>
                <p className="text-[var(--text-secondary)] mb-6">
                  Select topics to reach readers interested in specific subjects (optional)
                </p>

                <div className="flex flex-wrap gap-2">
                  {TOPICS.map((topic) => (
                    <button
                      key={topic}
                      onClick={() => {
                        setSelectedTopics(prev => 
                          prev.includes(topic)
                            ? prev.filter(t => t !== topic)
                            : [...prev, topic]
                        )
                      }}
                      className={`px-4 py-2 rounded-full text-sm transition-all ${
                        selectedTopics.includes(topic)
                          ? 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                      }`}
                    >
                      {topic}
                    </button>
                  ))}
                </div>

                {selectedTopics.length === 0 && (
                  <p className="text-sm text-[var(--text-tertiary)] mt-4">
                    No topics selected - your campaign will reach all readers
                  </p>
                )}
              </div>
            )}

            {step === 'review' && (
              <div>
                <h2 className="font-display text-xl mb-2">Review your campaign</h2>
                <p className="text-[var(--text-secondary)] mb-6">
                  Confirm everything looks correct before launching
                </p>

                {error && (
                  <div className="mb-6 p-4 rounded-xl bg-[var(--error)]/10 border border-[var(--error)]/20 flex items-start gap-3">
                    <AlertCircle size={20} className="text-[var(--error)] flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-[var(--error)]">{error}</p>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                    <p className="text-xs text-[var(--text-tertiary)] mb-1">Post to promote</p>
                    <p className="font-medium">{selectedPost?.title}</p>
                  </div>

                  <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                    <p className="text-xs text-[var(--text-tertiary)] mb-1">Campaign name</p>
                    <p className="font-medium">{campaignName}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                      <p className="text-xs text-[var(--text-tertiary)] mb-1">Objective</p>
                      <p className="font-medium capitalize">{objective}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                      <p className="text-xs text-[var(--text-tertiary)] mb-1">Bid</p>
                      <p className="font-medium font-mono">${bidAmount.toFixed(2)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                      <p className="text-xs text-[var(--text-tertiary)] mb-1">Daily budget</p>
                      <p className="font-medium font-mono">${dailyBudget.toFixed(2)}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                      <p className="text-xs text-[var(--text-tertiary)] mb-1">Total budget</p>
                      <p className="font-medium font-mono">${totalBudget.toFixed(2)}</p>
                    </div>
                  </div>

                  {selectedTopics.length > 0 && (
                    <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                      <p className="text-xs text-[var(--text-tertiary)] mb-2">Target topics</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedTopics.map((topic) => (
                          <span 
                            key={topic}
                            className="px-2 py-0.5 text-xs rounded bg-[var(--accent-soft)] text-[var(--accent)]"
                          >
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="p-4 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Total to reserve</p>
                        <p className="text-sm text-[var(--text-secondary)]">
                          Funds will be held until campaign ends
                        </p>
                      </div>
                      <p className="font-display text-2xl">${totalBudget.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-8 border-t border-[var(--border-light)] mt-8">
            <button
              onClick={goBack}
              disabled={!canGoBack}
              className="btn btn-secondary"
            >
              <ArrowLeft size={16} />
              Back
            </button>

            <button
              onClick={goForward}
              disabled={!canGoForward() || creating}
              className="btn btn-primary"
            >
              {creating ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Creating...
                </>
              ) : step === 'review' ? (
                <>
                  <Rocket size={16} />
                  Launch Campaign
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
      </main>
    </>
  )
}




