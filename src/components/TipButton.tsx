'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Heart, Loader2, X, DollarSign } from 'lucide-react'

interface TipButtonProps {
  creatorId: string
  creatorName: string
  postId?: string
}

const TIP_AMOUNTS = [
  { cents: 200, label: '$2' },
  { cents: 500, label: '$5' },
  { cents: 1000, label: '$10' },
  { cents: 2000, label: '$20' },
]

export function TipButton({ creatorId, creatorName, postId }: TipButtonProps) {
  const [showModal, setShowModal] = useState(false)
  const [amount, setAmount] = useState(500)
  const [customAmount, setCustomAmount] = useState('')
  const [message, setMessage] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const router = useRouter()
  const supabase = createClient()

  const handleTip = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    
    // Allow anonymous tips
    const finalAmount = customAmount ? parseInt(customAmount) * 100 : amount
    
    if (finalAmount < 100) {
      setError('Minimum tip is $1')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/stripe/create-tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creatorId,
          postId,
          amountCents: finalAmount,
          message,
          isAnonymous,
        }),
      })

      if (!res.ok) throw new Error('Failed to create tip')

      const { clientSecret } = await res.json()
      
      // In a real implementation, you'd use Stripe Elements here
      // For now, redirect to a checkout page or show payment form
      alert('Stripe payment flow would open here. Client secret: ' + clientSecret.substring(0, 20) + '...')
      setShowModal(false)
    } catch (err) {
      setError('Failed to process tip. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="btn btn-secondary"
      >
        <Heart size={16} />
        Tip
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          
          <div className="relative bg-[var(--bg-primary)] rounded-xl shadow-2xl w-full max-w-md p-6 animate-scale-in">
            <button 
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 p-2 hover:bg-[var(--bg-secondary)] rounded-lg"
            >
              <X size={18} />
            </button>

            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-full bg-[var(--accent-soft)] flex items-center justify-center mx-auto mb-3">
                <Heart size={24} className="text-[var(--accent)]" />
              </div>
              <h2 className="font-display text-xl">Tip {creatorName}</h2>
              <p className="text-sm text-[var(--text-secondary)]">Show your appreciation</p>
            </div>

            {/* Amount selection */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {TIP_AMOUNTS.map(({ cents, label }) => (
                <button
                  key={cents}
                  onClick={() => { setAmount(cents); setCustomAmount('') }}
                  className={`py-3 rounded-lg font-medium transition-colors ${
                    amount === cents && !customAmount
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Custom amount */}
            <div className="relative mb-4">
              <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                type="number"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder="Custom amount"
                className="input pl-9"
                min="1"
              />
            </div>

            {/* Message */}
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a message (optional)"
              className="input mb-4 min-h-[80px] resize-none"
              maxLength={200}
            />

            {/* Anonymous option */}
            <label className="flex items-center gap-2 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm text-[var(--text-secondary)]">Send anonymously</span>
            </label>

            {error && (
              <p className="text-sm text-[var(--error)] mb-4">{error}</p>
            )}

            <button
              onClick={handleTip}
              disabled={loading}
              className="btn btn-primary w-full"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  Send {customAmount ? `$${customAmount}` : TIP_AMOUNTS.find(t => t.cents === amount)?.label}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
