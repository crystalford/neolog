'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Link2, Loader2, Check, Copy, RefreshCw } from 'lucide-react'

interface ShareDraftButtonProps {
  postId: string
  existingToken?: string | null
  expiresAt?: string | null
}

export function ShareDraftButton({ postId, existingToken, expiresAt }: ShareDraftButtonProps) {
  const [loading, setLoading] = useState(false)
  const [token, setToken] = useState(existingToken || null)
  const [expires, setExpires] = useState(expiresAt || null)
  const [copied, setCopied] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  
  const supabase = createClient()

  const generateLink = async () => {
    setLoading(true)
    
    const { data } = await supabase
      .rpc('create_preview_link', { 
        p_post_id: postId,
        p_expires_hours: 72 
      })

    if (data) {
      setToken(data)
      const expDate = new Date()
      expDate.setHours(expDate.getHours() + 72)
      setExpires(expDate.toISOString())
    }
    
    setLoading(false)
  }

  const copyLink = async () => {
    if (!token) return
    
    const url = `${window.location.origin}/preview/${token}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isExpired = expires ? new Date(expires) < new Date() : false

  const formatExpiry = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const hours = Math.round((d.getTime() - now.getTime()) / 3600000)
    if (hours < 1) return 'Expires soon'
    if (hours < 24) return `${hours}h left`
    return `${Math.round(hours / 24)}d left`
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="btn btn-secondary btn-sm"
      >
        <Link2 size={14} />
        Share Draft
      </button>

      {showMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
          <div className="absolute right-0 top-full mt-2 w-72 bg-[var(--bg-primary)] border border-[var(--border-medium)] rounded-xl shadow-lg z-20 p-4">
            <h3 className="font-medium mb-2">Preview Link</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Share this link to let others preview your draft before publishing.
            </p>

            {token && !isExpired ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={`${window.location.origin}/preview/${token}`}
                    readOnly
                    className="input text-xs flex-1"
                  />
                  <button
                    onClick={copyLink}
                    className="btn btn-secondary btn-sm"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                
                <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
                  <span>{formatExpiry(expires!)}</span>
                  <button
                    onClick={generateLink}
                    disabled={loading}
                    className="flex items-center gap-1 hover:text-[var(--text-primary)]"
                  >
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                    Regenerate
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={generateLink}
                disabled={loading}
                className="btn btn-primary w-full"
              >
                {loading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Link2 size={14} />
                    {isExpired ? 'Generate New Link' : 'Generate Preview Link'}
                  </>
                )}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
