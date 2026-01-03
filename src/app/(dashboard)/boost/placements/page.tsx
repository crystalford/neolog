'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/Header'
import { 
  ArrowLeft, Plus, DollarSign, Rss, FileText,
  Sparkles, Check, Trash2, Settings, Loader2
} from 'lucide-react'

type Placement = {
  id: string
  placement_type: string
  is_active: boolean
  min_bid_cents: number
  revenue_share_percent: number
  blocked_topics: string[] | null
  created_at: string
}

const PLACEMENT_TYPES = [
  {
    id: 'feed_slot',
    label: 'Feed Slot',
    description: 'Show promoted posts in your followers\' feeds',
    icon: Rss,
  },
  {
    id: 'end_of_post',
    label: 'End of Post',
    description: 'Show promoted posts after your articles',
    icon: FileText,
  },
  {
    id: 'recommended',
    label: 'Recommended Section',
    description: 'Include in your "Recommended" sidebar',
    icon: Sparkles,
  },
]

const TOPICS = [
  'technology', 'ai', 'writing', 'business', 'startups',
  'science', 'health', 'finance', 'crypto', 'design',
  'politics', 'culture', 'philosophy', 'productivity', 'marketing'
]

export default function PlacementsPage() {
  const [placements, setPlacements] = useState<Placement[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  
  // New placement form
  const [newType, setNewType] = useState('feed_slot')
  const [newMinBid, setNewMinBid] = useState(0.50)
  const [newRevenueShare, setNewRevenueShare] = useState(70)
  const [blockedTopics, setBlockedTopics] = useState<string[]>([])
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadPlacements()
  }, [])

  const loadPlacements = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }

    const { data } = await supabase
      .from('boost_placements')
      .select('*')
      .eq('publisher_id', session.user.id)
      .order('created_at', { ascending: false })

    if (data) {
      setPlacements(data)
    }
    setLoading(false)
  }

  const createPlacement = async () => {
    setCreating(true)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }

    const { error } = await supabase
      .from('boost_placements')
      .insert({
        publisher_id: session.user.id,
        placement_type: newType,
        min_bid_cents: Math.round(newMinBid * 100),
        revenue_share_percent: newRevenueShare,
        blocked_topics: blockedTopics.length > 0 ? blockedTopics : null,
        is_active: true,
      })

    if (!error) {
      setShowCreateModal(false)
      setNewType('feed_slot')
      setNewMinBid(0.50)
      setBlockedTopics([])
      loadPlacements()
    }

    setCreating(false)
  }

  const togglePlacement = async (placement: Placement) => {
    await supabase
      .from('boost_placements')
      .update({ is_active: !placement.is_active })
      .eq('id', placement.id)

    setPlacements(placements.map(p => 
      p.id === placement.id ? { ...p, is_active: !p.is_active } : p
    ))
  }

  const deletePlacement = async (id: string) => {
    if (!confirm('Delete this placement? Any active campaigns using it will be affected.')) {
      return
    }

    await supabase
      .from('boost_placements')
      .delete()
      .eq('id', id)

    setPlacements(placements.filter(p => p.id !== id))
  }

  const getPlacementType = (type: string) => {
    return PLACEMENT_TYPES.find(t => t.id === type)
  }

  return (
    <>
      <Header />
      <main className="pt-16 pb-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          {/* Header */}
          <div className="flex items-center justify-between pt-8 mb-8">
            <div className="flex items-center gap-4">
              <Link 
                href="/boost"
                className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
              >
                <ArrowLeft size={20} />
              </Link>
              <div>
                <h1 className="font-display text-2xl">Placements</h1>
                <p className="text-[var(--text-secondary)]">
                  Earn by hosting promoted content
                </p>
              </div>
            </div>
            
            <button 
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary"
            >
              <Plus size={16} />
              New Placement
            </button>
          </div>

          {/* Explanation */}
          <div className="p-4 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/20 mb-8">
            <p className="text-sm">
              <strong>How it works:</strong> Other creators pay to show their posts to your audience. 
              You earn {newRevenueShare}% of what they spend. You control minimum bids and can block topics you don't want.
            </p>
          </div>

          {/* Placements list */}
          {loading ? (
            <div className="space-y-4">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-24 skeleton rounded-xl" />
              ))}
            </div>
          ) : placements.length === 0 ? (
            <div className="text-center py-16 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
              <DollarSign size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
              <h2 className="font-display text-xl mb-2">No placements yet</h2>
              <p className="text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
                Create placements to start earning from promoted content
              </p>
              <button 
                onClick={() => setShowCreateModal(true)}
                className="btn btn-primary"
              >
                <Plus size={16} />
                Create Your First Placement
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {placements.map((placement) => {
                const type = getPlacementType(placement.placement_type)
                const Icon = type?.icon || Sparkles
                
                return (
                  <div 
                    key={placement.id}
                    className="p-5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          placement.is_active 
                            ? 'bg-[var(--success)]/10 text-[var(--success)]'
                            : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]'
                        }`}>
                          <Icon size={20} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium">{type?.label}</h3>
                            <span className={`px-2 py-0.5 text-xs rounded-full ${
                              placement.is_active
                                ? 'bg-[var(--success)]/10 text-[var(--success)]'
                                : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]'
                            }`}>
                              {placement.is_active ? 'Active' : 'Paused'}
                            </span>
                          </div>
                          <p className="text-sm text-[var(--text-secondary)]">
                            {type?.description}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => togglePlacement(placement)}
                          className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
                          title={placement.is_active ? 'Pause' : 'Activate'}
                        >
                          {placement.is_active ? (
                            <Settings size={16} className="text-[var(--text-tertiary)]" />
                          ) : (
                            <Check size={16} className="text-[var(--success)]" />
                          )}
                        </button>
                        <button
                          onClick={() => deletePlacement(placement.id)}
                          className="p-2 rounded-lg hover:bg-[var(--error)]/10 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={16} className="text-[var(--error)]" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-[var(--border-light)]">
                      <div>
                        <p className="text-xs text-[var(--text-tertiary)] mb-1">Min. Bid</p>
                        <p className="font-mono text-sm">${(placement.min_bid_cents / 100).toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--text-tertiary)] mb-1">Your Share</p>
                        <p className="font-mono text-sm">{placement.revenue_share_percent}%</p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--text-tertiary)] mb-1">Blocked</p>
                        <p className="text-sm">
                          {placement.blocked_topics?.length || 0} topics
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
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
          <div className="relative bg-[var(--bg-primary)] rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h2 className="font-display text-xl mb-6">Create Placement</h2>

            {/* Type selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-3">Placement Type</label>
              <div className="space-y-2">
                {PLACEMENT_TYPES.map((type) => {
                  const Icon = type.icon
                  return (
                    <button
                      key={type.id}
                      onClick={() => setNewType(type.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        newType === type.id
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                          : 'border-[var(--border-light)] hover:border-[var(--border-medium)]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={18} className={newType === type.id ? 'text-[var(--accent)]' : ''} />
                        <div>
                          <p className="font-medium text-sm">{type.label}</p>
                          <p className="text-xs text-[var(--text-tertiary)]">{type.description}</p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Min bid */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Minimum Bid</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]">$</span>
                <input
                  type="number"
                  value={newMinBid}
                  onChange={(e) => setNewMinBid(parseFloat(e.target.value) || 0)}
                  className="input pl-7"
                  min="0.10"
                  step="0.10"
                />
              </div>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">
                Only show campaigns bidding at least this amount
              </p>
            </div>

            {/* Blocked topics */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Block Topics (optional)</label>
              <div className="flex flex-wrap gap-2">
                {TOPICS.map((topic) => (
                  <button
                    key={topic}
                    onClick={() => {
                      setBlockedTopics(prev => 
                        prev.includes(topic)
                          ? prev.filter(t => t !== topic)
                          : [...prev, topic]
                      )
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs transition-all ${
                      blockedTopics.includes(topic)
                        ? 'bg-[var(--error)]/10 text-[var(--error)] line-through'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>

            {/* Revenue share info */}
            <div className="p-4 rounded-lg bg-[var(--bg-secondary)] mb-6">
              <p className="text-sm">
                <strong>Your earnings:</strong> You'll receive {newRevenueShare}% of what advertisers pay. 
                The platform keeps {100 - newRevenueShare}%.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={createPlacement}
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
                    Create Placement
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
