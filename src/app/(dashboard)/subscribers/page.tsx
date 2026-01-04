'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { 
  Users, Mail, Download, Search, UserPlus,
  Check, Clock, AlertCircle, UserMinus, Loader2,
  Copy, ExternalLink
} from 'lucide-react'

type Subscriber = {
  id: string
  email: string
  name: string | null
  status: string
  confirmed: boolean
  email_new_posts: boolean
  email_weekly_digest: boolean
  source: string | null
  created_at: string
}

type UserSubscriber = {
  id: string
  created_at: string
  tier: string
  email_new_posts: boolean
  subscriber: {
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
  }
}

export default function SubscribersPage() {
  const [loading, setLoading] = useState(true)
  const [emailSubscribers, setEmailSubscribers] = useState<Subscriber[]>([])
  const [userSubscribers, setUserSubscribers] = useState<UserSubscriber[]>([])
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'all' | 'users' | 'email'>('all')
  const [copied, setCopied] = useState<string | null>(null)
  const [emailSegment, setEmailSegment] = useState<'all' | 'active' | 'pending' | 'unsubscribed' | 'bounced' | 'complained'>('all')
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadSubscribers()
  }, [])

  const loadSubscribers = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }

    // Load email subscribers
    const { data: emailSubs } = await supabase
      .from('email_subscribers')
      .select('*')
      .eq('creator_id', session.user.id)
      .order('created_at', { ascending: false })

    if (emailSubs) {
      setEmailSubscribers(emailSubs)
    }

    // Load user subscribers
    const { data: userSubs } = await supabase
      .from('subscriptions')
      .select(`
        *,
        subscriber:profiles(id, username, display_name, avatar_url)
      `)
      .eq('creator_id', session.user.id)
      .order('created_at', { ascending: false })

    if (userSubs) {
      setUserSubscribers(userSubs as any)
    }

    setLoading(false)
  }

  const totalCount = emailSubscribers.filter(s => s.status === 'active').length + userSubscribers.length
  const pendingCount = emailSubscribers.filter(s => s.status === 'pending').length

  const filteredEmailSubs = emailSubscribers.filter(s => {
    const matchesSearch = !search || s.email.toLowerCase().includes(search.toLowerCase())
    const matchesSegment = emailSegment === 'all' || s.status === emailSegment
    return matchesSearch && matchesSegment
  })

  const filteredUserSubs = userSubscribers.filter(s =>
    !search || 
    s.subscriber.username.toLowerCase().includes(search.toLowerCase()) ||
    (s.subscriber.display_name?.toLowerCase().includes(search.toLowerCase()))
  )

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <Check size={14} className="text-[var(--success)]" />
      case 'pending': return <Clock size={14} className="text-[var(--warning)]" />
      case 'unsubscribed': return <UserMinus size={14} className="text-[var(--text-tertiary)]" />
      case 'bounced':
      case 'complained': return <AlertCircle size={14} className="text-[var(--error)]" />
      default: return null
    }
  }

  const exportSubscribers = () => {
    const data = [
      ['Email', 'Name', 'Status', 'Source', 'Subscribed At'],
      ...emailSubscribers.map(s => [
        s.email,
        s.name || '',
        s.status,
        s.source || '',
        new Date(s.created_at).toISOString(),
      ]),
    ]
    
    const csv = data.map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `subscribers-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const copyValue = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(key)
      setTimeout(() => setCopied(null), 1500)
    } catch (error) {
      console.error('Clipboard error:', error)
    }
  }

  const toggleEmailDigest = async (subscriber: Subscriber) => {
    await supabase
      .from('email_subscribers')
      .update({ email_weekly_digest: !subscriber.email_weekly_digest })
      .eq('id', subscriber.id)

    setEmailSubscribers((prev) =>
      prev.map((item) =>
        item.id === subscriber.id
          ? { ...item, email_weekly_digest: !subscriber.email_weekly_digest }
          : item
      )
    )
  }

  const toggleEmailUpdates = async (subscriber: Subscriber) => {
    await supabase
      .from('email_subscribers')
      .update({ email_new_posts: !subscriber.email_new_posts })
      .eq('id', subscriber.id)

    setEmailSubscribers((prev) =>
      prev.map((item) =>
        item.id === subscriber.id
          ? { ...item, email_new_posts: !subscriber.email_new_posts }
          : item
      )
    )
  }

  const unsubscribeEmail = async (subscriber: Subscriber) => {
    await supabase
      .from('email_subscribers')
      .update({ status: 'unsubscribed' })
      .eq('id', subscriber.id)

    setEmailSubscribers((prev) =>
      prev.map((item) =>
        item.id === subscriber.id
          ? { ...item, status: 'unsubscribed' }
          : item
      )
    )
  }

  const toggleUserUpdates = async (subscriber: UserSubscriber) => {
    await supabase
      .from('subscriptions')
      .update({ email_new_posts: !subscriber.email_new_posts })
      .eq('id', subscriber.id)

    setUserSubscribers((prev) =>
      prev.map((item) =>
        item.id === subscriber.id
          ? { ...item, email_new_posts: !subscriber.email_new_posts }
          : item
      )
    )
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <main className="pb-16">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-8 mb-8">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Audience</p>
            <h1 className="font-display text-3xl text-[var(--text-primary)]">Subscribers</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              {totalCount.toLocaleString()} subscriber{totalCount !== 1 ? 's' : ''}
              {pendingCount > 0 && ` - ${pendingCount} pending`}
            </p>
          </div>
          
          <button
            onClick={exportSubscribers}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-light)] bg-[var(--bg-primary)] text-sm font-medium text-[var(--text-primary)] hover:border-[var(--border-medium)] transition-colors"
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total', value: totalCount },
            { label: 'User accounts', value: userSubscribers.length },
            { label: 'Email only', value: emailSubscribers.filter(s => s.status === 'active').length },
            { label: 'Pending', value: pendingCount },
          ].map((stat) => (
            <div key={stat.label} className="p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">{stat.label}</p>
              <p className="mt-2 font-display text-2xl text-[var(--text-primary)]">{stat.value}</p>
            </div>
          ))}
        </div>

          {/* Search and filters */}
          <div className="flex flex-wrap items-center gap-4 mb-6">
            <div className="relative flex-1 min-w-[240px]">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search subscribers..."
                className="input pl-10"
              />
            </div>
            
            <div className="flex gap-1 p-1 bg-[var(--bg-primary)] border border-[var(--border-light)] rounded-xl">
              {[
                { id: 'all', label: 'All' },
                { id: 'users', label: 'Users' },
                { id: 'email', label: 'Email' },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setTab(id as typeof tab)}
                  className={`px-4 py-2 text-sm rounded-lg transition-all ${
                    tab === id
                      ? 'bg-[var(--accent)] text-[var(--text-inverse)] font-medium'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {(tab === 'all' || tab === 'email') && (
            <div className="flex flex-wrap items-center gap-2 mb-6">
              {[
                { id: 'all', label: 'All' },
                { id: 'active', label: 'Active' },
                { id: 'pending', label: 'Pending' },
                { id: 'unsubscribed', label: 'Unsubscribed' },
                { id: 'bounced', label: 'Bounced' },
                { id: 'complained', label: 'Complained' },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setEmailSegment(id as typeof emailSegment)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    emailSegment === id
                      ? 'bg-[var(--accent)] text-[var(--text-inverse)] border-[var(--accent)]'
                      : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border-[var(--border-light)] hover:border-[var(--border-medium)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-[var(--text-tertiary)]" />
          </div>
        ) : totalCount === 0 ? (
          <div className="text-center py-16 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm">
            <UserPlus size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
            <h2 className="font-display text-xl mb-2 text-[var(--text-primary)]">No subscribers yet</h2>
            <p className="text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
              Share your profile to start building your audience
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {(tab === 'all' || tab === 'users') && (
              <div className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm overflow-hidden">
                <div className="p-4 border-b border-[var(--border-light)]">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">User subscribers</p>
                </div>
                <div className="hidden md:grid grid-cols-[minmax(0,1fr)_160px_140px] gap-4 px-4 py-3 text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] border-b border-[var(--border-light)]">
                  <span>Subscriber</span>
                  <span>Tier</span>
                  <span className="text-right">Actions</span>
                </div>
                <div className="divide-y divide-[var(--border-light)]">
                  {/* User subscribers */}
                  {filteredUserSubs.map((sub) => (
                    <div 
                      key={sub.id}
                      className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_160px_140px] gap-4 px-4 py-4 items-center"
                    >
                      <div className="flex items-center gap-3">
                        {sub.subscriber.avatar_url ? (
                          <img 
                            src={sub.subscriber.avatar_url}
                            alt={sub.subscriber.display_name || sub.subscriber.username}
                            className="w-10 h-10 rounded-full"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[var(--accent)] flex items-center justify-center text-white font-medium">
                            {(sub.subscriber.display_name || sub.subscriber.username)[0].toUpperCase()}
                          </div>
                        )}
                        <div>
                          <Link 
                            href={`/${sub.subscriber.username}`}
                            className="font-medium text-[var(--text-primary)] hover:text-[var(--accent)]"
                          >
                            {sub.subscriber.display_name || sub.subscriber.username}
                          </Link>
                          <p className="text-sm text-[var(--text-tertiary)]">
                            @{sub.subscriber.username}
                          </p>
                        </div>
                      </div>
                      <div>
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                          <Users size={12} />
                          {sub.tier}
                        </span>
                        <p className="text-xs text-[var(--text-tertiary)] mt-1">
                          {formatDate(sub.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 md:justify-end">
                        <Link
                          href={`/${sub.subscriber.username}`}
                          className="p-2 rounded-lg border border-[var(--border-light)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-medium)] transition-colors"
                          title="View profile"
                        >
                          <ExternalLink size={14} />
                        </Link>
                        <button
                          onClick={() => toggleUserUpdates(sub)}
                          className="p-2 rounded-lg border border-[var(--border-light)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-medium)] transition-colors"
                          title={sub.email_new_posts ? 'Mute email updates' : 'Enable email updates'}
                        >
                          {sub.email_new_posts ? <Mail size={14} /> : <UserMinus size={14} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

              {/* Email subscribers */}
              {(tab === 'all' || tab === 'email') && (
                <div className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-[var(--border-light)]">
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Email subscribers</p>
                  </div>
                  <div className="hidden md:grid grid-cols-[minmax(0,1fr)_140px_140px] gap-4 px-4 py-3 text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] border-b border-[var(--border-light)]">
                    <span>Email</span>
                    <span>Status</span>
                    <span className="text-right">Actions</span>
                  </div>
                  <div className="divide-y divide-[var(--border-light)]">
                    {filteredEmailSubs.map((sub) => (
                      <div 
                        key={sub.id}
                        className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_140px_140px] gap-4 px-4 py-4 items-center"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center">
                            <Mail size={18} className="text-[var(--text-tertiary)]" />
                          </div>
                          <div>
                            <p className="font-medium text-[var(--text-primary)]">{sub.email}</p>
                            {sub.name && (
                              <p className="text-sm text-[var(--text-tertiary)]">{sub.name}</p>
                            )}
                          </div>
                        </div>
                        <div>
                          <span className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-full ${
                            sub.status === 'active' 
                              ? 'bg-[var(--success)]/10 text-[var(--success)]'
                              : sub.status === 'pending'
                              ? 'bg-[var(--warning)]/10 text-[var(--warning)]'
                              : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]'
                          }`}>
                            {getStatusIcon(sub.status)}
                            {sub.status}
                          </span>
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">
                            {formatDate(sub.created_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 md:justify-end">
                          <button
                            onClick={() => copyValue(sub.email, sub.id)}
                            className="p-2 rounded-lg border border-[var(--border-light)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-medium)] transition-colors"
                            title={copied === sub.id ? 'Copied' : 'Copy email'}
                          >
                            {copied === sub.id ? <Check size={14} /> : <Copy size={14} />}
                          </button>
                          <button
                            onClick={() => toggleEmailUpdates(sub)}
                            className="p-2 rounded-lg border border-[var(--border-light)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-medium)] transition-colors"
                            title={sub.email_new_posts ? 'Mute new post emails' : 'Enable new post emails'}
                          >
                            <Mail size={14} />
                          </button>
                          <button
                            onClick={() => toggleEmailDigest(sub)}
                            className="p-2 rounded-lg border border-[var(--border-light)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-medium)] transition-colors"
                            title={sub.email_weekly_digest ? 'Disable weekly digest' : 'Enable weekly digest'}
                          >
                            <Clock size={14} />
                          </button>
                          <button
                            onClick={() => unsubscribeEmail(sub)}
                            className="p-2 rounded-lg border border-[var(--border-light)] text-[var(--error)] hover:bg-[var(--error)]/10 transition-colors"
                            title="Unsubscribe"
                          >
                            <UserMinus size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>
        )}
      </div>
    </main>
  )
}


