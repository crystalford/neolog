'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Loader2, Plus, X, Trash2 } from 'lucide-react'

interface Props {
  params: { id: string }
}

export default function EditTierPage({ params }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [description, setDescription] = useState('')
  const [benefits, setBenefits] = useState<string[]>([])
  const [newBenefit, setNewBenefit] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [subscriberCount, setSubscriberCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadTier()
  }, [params.id])

  const loadTier = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }

    const { data: tier, error } = await supabase
      .from('subscription_tiers')
      .select('*')
      .eq('id', params.id)
      .eq('creator_id', session.user.id)
      .single()

    if (error || !tier) {
      router.push('/tiers')
      return
    }

    setName(tier.name)
    setPrice((tier.price_cents / 100).toFixed(2))
    setDescription(tier.description || '')
    setBenefits(tier.benefits || [])
    setIsActive(tier.is_active)

    // Get subscriber count
    const { count } = await supabase
      .from('paid_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('tier_id', params.id)
      .eq('status', 'active')

    setSubscriberCount(count || 0)
    setLoading(false)
  }

  const addBenefit = () => {
    if (newBenefit.trim() && benefits.length < 10) {
      setBenefits([...benefits, newBenefit.trim()])
      setNewBenefit('')
    }
  }

  const removeBenefit = (index: number) => {
    setBenefits(benefits.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    setError(null)

    if (!name.trim()) {
      setError('Name is required')
      return
    }

    setSaving(true)

    const { error: updateError } = await supabase
      .from('subscription_tiers')
      .update({
        name: name.trim(),
        description: description.trim() || null,
        benefits,
        is_active: isActive,
      })
      .eq('id', params.id)

    if (updateError) {
      setError('Failed to update tier')
      setSaving(false)
      return
    }

    router.push('/dashboard/tiers')
  }

  const handleDelete = async () => {
    if (subscriberCount > 0) {
      setError('Cannot delete a tier with active subscribers. Deactivate it instead.')
      return
    }

    if (!confirm('Delete this tier? This cannot be undone.')) return

    setDeleting(true)

    await supabase
      .from('subscription_tiers')
      .delete()
      .eq('id', params.id)

    router.push('/dashboard/tiers')
  }

  if (loading) {
    return (
      <main className="px-6 lg:px-12 py-10 flex items-center justify-center min-h-[60vh]">
        <Loader2 size={32} className="animate-spin text-[var(--text-tertiary)]" />
      </main>
    )
  }

  return (
    <main className="px-6 lg:px-12 py-10 max-w-2xl mx-auto">
      <div className="mb-8">
            <Link 
              href="/dashboard/tiers" 
              className="inline-flex items-center gap-1 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] mb-4"
            >
              <ArrowLeft size={14} />
              Back to Tiers
            </Link>
            <h1 className="font-display text-3xl">Edit Tier</h1>
            {subscriberCount > 0 && (
              <p className="text-sm text-[var(--text-secondary)] mt-2">
                {subscriberCount} active subscriber{subscriberCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">Tier Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                placeholder="e.g., Supporter, Premium, VIP"
                maxLength={50}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Price (per month)
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[var(--text-secondary)]">$</span>
                <input
                  type="text"
                  value={price}
                  disabled
                  className="input bg-[var(--bg-tertiary)] cursor-not-allowed"
                />
              </div>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">
                Price cannot be changed after creation
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input min-h-[100px] resize-none"
                placeholder="What do subscribers get?"
                maxLength={500}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Benefits</label>
              <div className="space-y-2 mb-3">
                {benefits.map((benefit, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="flex-1 px-3 py-2 bg-[var(--bg-secondary)] rounded-lg text-sm">
                      {benefit}
                    </span>
                    <button
                      onClick={() => removeBenefit(i)}
                      className="p-2 text-[var(--text-tertiary)] hover:text-[var(--error)]"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newBenefit}
                  onChange={(e) => setNewBenefit(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addBenefit())}
                  className="input flex-1"
                  placeholder="Add a benefit..."
                  maxLength={100}
                />
                <button
                  onClick={addBenefit}
                  disabled={!newBenefit.trim()}
                  className="btn btn-secondary"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded border-[var(--border-medium)]"
                />
                <div>
                  <span className="font-medium">Active</span>
                  <p className="text-sm text-[var(--text-tertiary)]">
                    Inactive tiers are hidden from new subscribers
                  </p>
                </div>
              </label>
            </div>

            {error && (
              <p className="text-sm text-[var(--error)]">{error}</p>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-[var(--border-light)]">
              <button
                onClick={handleDelete}
                disabled={deleting || subscriberCount > 0}
                className="btn btn-secondary text-[var(--error)] hover:bg-[var(--error)]/10 disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Trash2 size={16} />
                )}
                Delete Tier
              </button>

              <div className="flex gap-3">
                <Link href="/dashboard/tiers" className="btn btn-secondary">
                  Cancel
                </Link>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn btn-primary"
                >
                  {saving ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </div>
          </div>
    </main>
  )
}


