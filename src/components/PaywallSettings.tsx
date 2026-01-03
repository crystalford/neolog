'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Lock, Unlock, DollarSign, Users, TrendingUp,
  Check, Settings, Loader2
} from 'lucide-react'

interface PaywallSettingsProps {
  postId?: string
  onUpdate?: (isPremium: boolean, previewLength?: number) => void
}

export function PaywallSettings({ postId, onUpdate }: PaywallSettingsProps) {
  const [isPremium, setIsPremium] = useState(false)
  const [previewLength, setPreviewLength] = useState(3) // paragraphs
  const [tiers, setTiers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    loadSettings()
  }, [postId])

  const loadSettings = async () => {
    setLoading(true)
    try {
      // Load subscription tiers
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: tiersData } = await supabase
        .from('subscription_tiers')
        .select('*')
        .eq('creator_id', session.user.id)
        .eq('is_active', true)

      if (tiersData) {
        setTiers(tiersData)
      }

      // Load post settings if postId provided
      if (postId) {
        const { data: post } = await supabase
          .from('posts')
          .select('is_premium, preview_length')
          .eq('id', postId)
          .single()

        if (post) {
          setIsPremium(post.is_premium || false)
          setPreviewLength(post.preview_length || 3)
        }
      }
    } catch (error) {
      console.error('Error loading paywall settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!postId) {
      // Just update parent component
      onUpdate?.(isPremium, previewLength)
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase
        .from('posts')
        .update({
          is_premium: isPremium,
          preview_length: previewLength,
        })
        .eq('id', postId)

      if (error) throw error

      onUpdate?.(isPremium, previewLength)
    } catch (error) {
      console.error('Error saving paywall settings:', error)
      alert('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 size={24} className="animate-spin text-[var(--text-tertiary)]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Premium toggle */}
      <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Lock size={20} />
              Premium Content
            </h3>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Restrict access to paid subscribers only
            </p>
          </div>
          <button
            onClick={() => setIsPremium(!isPremium)}
            className={`relative w-14 h-8 rounded-full transition-colors ${
              isPremium ? 'bg-[var(--accent)]' : 'bg-[var(--bg-tertiary)]'
            }`}
          >
            <div
              className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white transition-transform ${
                isPremium ? 'translate-x-6' : ''
              }`}
            />
          </button>
        </div>

        {isPremium && (
          <div className="space-y-4 pt-4 border-t border-[var(--border-light)]">
            <div>
              <label className="block text-sm font-medium mb-2">
                Free Preview Length
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={previewLength}
                  onChange={(e) => setPreviewLength(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="text-sm font-medium w-16 text-right">
                  {previewLength} {previewLength === 1 ? 'paragraph' : 'paragraphs'}
                </span>
              </div>
              <p className="text-xs text-[var(--text-tertiary)] mt-2">
                Free users will see the first {previewLength} paragraph{previewLength !== 1 ? 's' : ''} before hitting the paywall
              </p>
            </div>

            {/* Preview */}
            <div className="p-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-light)]">
              <p className="text-sm mb-2 font-medium">Preview:</p>
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-3 rounded ${
                      i < previewLength
                        ? 'bg-[var(--text-tertiary)]'
                        : 'bg-[var(--text-tertiary)]/20'
                    }`}
                    style={{ width: `${90 - i * 10}%` }}
                  />
                ))}
                {previewLength < 3 && (
                  <div className="flex items-center gap-2 p-3 rounded bg-[var(--accent-soft)] border border-[var(--accent)]/20">
                    <Lock size={16} className="text-[var(--accent)]" />
                    <span className="text-sm text-[var(--accent)] font-medium">
                      Premium content starts here
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Subscription tiers */}
      {tiers.length > 0 ? (
        <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
          <h3 className="font-semibold text-lg mb-4">Available Tiers</h3>
          <div className="space-y-3">
            {tiers.map(tier => (
              <div
                key={tier.id}
                className="flex items-center justify-between p-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-light)]"
              >
                <div>
                  <p className="font-medium">{tier.name}</p>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {tier.description}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg">
                    ${(tier.price_monthly / 100).toFixed(2)}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)]">per month</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
          <div className="text-center py-8">
            <DollarSign size={48} className="mx-auto mb-4 text-[var(--text-tertiary)] opacity-50" />
            <h3 className="font-semibold mb-2">No Subscription Tiers Yet</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Create subscription tiers to monetize your premium content
            </p>
            <a href="/dashboard/tiers" className="btn btn-primary btn-sm">
              <Settings size={16} />
              Set Up Tiers
            </a>
          </div>
        </div>
      )}

      {/* Benefits of premium */}
      <div className="p-6 rounded-xl bg-gradient-to-br from-[var(--accent-soft)] to-transparent border border-[var(--accent)]/20">
        <h3 className="font-semibold text-lg mb-4">Why Offer Premium Content?</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent)]/20 flex items-center justify-center flex-shrink-0">
              <DollarSign size={16} className="text-[var(--accent)]" />
            </div>
            <div>
              <p className="font-medium mb-1">Recurring Revenue</p>
              <p className="text-sm text-[var(--text-secondary)]">
                Build sustainable income from your content
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent)]/20 flex items-center justify-center flex-shrink-0">
              <Users size={16} className="text-[var(--accent)]" />
            </div>
            <div>
              <p className="font-medium mb-1">Loyal Community</p>
              <p className="text-sm text-[var(--text-secondary)]">
                Attract your most engaged readers
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent)]/20 flex items-center justify-center flex-shrink-0">
              <TrendingUp size={16} className="text-[var(--accent)]" />
            </div>
            <div>
              <p className="font-medium mb-1">Higher Quality</p>
              <p className="text-sm text-[var(--text-secondary)]">
                Focus on depth over clickbait
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent)]/20 flex items-center justify-center flex-shrink-0">
              <Unlock size={16} className="text-[var(--accent)]" />
            </div>
            <div>
              <p className="font-medium mb-1">Exclusive Access</p>
              <p className="text-sm text-[var(--text-secondary)]">
                Reward supporters with premium insights
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Save button */}
      {postId && (
        <div className="flex justify-end">
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
              <>
                <Check size={16} />
                Save Settings
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
