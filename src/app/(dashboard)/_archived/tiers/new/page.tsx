'use client'export const runtime = 'edge'


import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Plus, X, Loader2, DollarSign } from 'lucide-react'
import Link from 'next/link'

export default function NewTierPage() {
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [benefits, setBenefits] = useState<string[]>([''])
  const [error, setError] = useState<string | null>(null)
  
  const router = useRouter()
  const supabase = createClient()

  const addBenefit = () => {
    setBenefits([...benefits, ''])
  }

  const updateBenefit = (index: number, value: string) => {
    const updated = [...benefits]
    updated[index] = value
    setBenefits(updated)
  }

  const removeBenefit = (index: number) => {
    setBenefits(benefits.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Name is required')
      return
    }

    const priceNum = parseFloat(price)
    if (isNaN(priceNum) || priceNum < 1) {
      setError('Price must be at least $1')
      return
    }

    setSaving(true)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }

    const filteredBenefits = benefits.filter(b => b.trim())

    // Create tier in database
    const { data: tier, error: dbError } = await supabase
      .from('subscription_tiers')
      .insert({
        creator_id: session.user.id,
        name: name.trim(),
        description: description.trim() || null,
        price_cents: Math.round(priceNum * 100),
        benefits: filteredBenefits.length > 0 ? filteredBenefits : null,
        is_active: true,
      })
      .select()
      .single()

    if (dbError) {
      setError('Failed to create tier')
      setSaving(false)
      return
    }

    // Create Stripe price
    try {
      const res = await fetch('/api/stripe/create-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tierId: tier.id,
          name: name.trim(),
          priceCents: Math.round(priceNum * 100),
        }),
      })

      if (res.ok) {
        const { priceId } = await res.json()
        await supabase
          .from('subscription_tiers')
          .update({ stripe_price_id: priceId })
          .eq('id', tier.id)
      }
    } catch (err) {
      // Tier created but Stripe sync failed - user can retry later
      console.error('Stripe price creation failed:', err)
    }

    router.push('/dashboard/tiers')
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
            <h1 className="font-display text-3xl">Create Subscription Tier</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                Tier Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                placeholder="e.g., Supporter, Premium, Founding Member"
                maxLength={50}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Monthly Price *
              </label>
              <div className="relative">
                <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="input pl-9"
                  placeholder="5"
                  min="1"
                  step="1"
                />
              </div>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">
                Minimum $1/month. You'll receive 90% after platform fee.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input min-h-[100px] resize-none"
                placeholder="What do subscribers get at this tier?"
                maxLength={500}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Benefits
              </label>
              <div className="space-y-2">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={benefit}
                      onChange={(e) => updateBenefit(index, e.target.value)}
                      className="input flex-1"
                      placeholder="e.g., Access to premium posts"
                      maxLength={100}
                    />
                    {benefits.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeBenefit(index)}
                        className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
                      >
                        <X size={16} className="text-[var(--text-tertiary)]" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addBenefit}
                className="mt-2 text-sm text-[var(--accent)] hover:underline flex items-center gap-1"
              >
                <Plus size={14} />
                Add benefit
              </button>
            </div>

            {error && (
              <p className="text-sm text-[var(--error)]">{error}</p>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={saving}
                className="btn btn-primary"
              >
                {saving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Tier'
                )}
              </button>
              <Link href="/dashboard/tiers" className="btn btn-secondary">
                Cancel
              </Link>
            </div>
      </form>
    </main>
  )
}


