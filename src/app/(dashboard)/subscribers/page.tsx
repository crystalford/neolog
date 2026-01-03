'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/Header'
import { 
  Users, Mail, Download, Search, UserPlus,
  Check, Clock, AlertCircle, UserMinus, Loader2
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

  const filteredEmailSubs = emailSubscribers.filter(s => 
    !search || s.email.toLowerCase().includes(search.toLowerCase())
  )

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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <>
      <Header />
      <main className="pt-20 pb-16">
        <div className="max-w-4xl mx-auto px-6">
          {/* Header */}
          <div className="flex items-center justify-between pt-8 mb-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
                <Users size={24} className="text-[var(--accent)]" />
              </div>
              <div>
                <h1 className="font-display text-3xl">Subscribers</h1>
                <p className="text-[var(--text-secondary)]">
                  {totalCount.toLocaleString()} subscriber{totalCount !== 1 ? 's' : ''}
                  {pendingCount > 0 && ` · ${pendingCount} pending`}
                </p>
              </div>
            </div>
            
            <button onClick={exportSubscribers} className="btn btn-secondary">
              <Download size={16} />
              Export CSV
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
              <p className="text-sm text-[var(--text-tertiary)] mb-1">Total</p>
              <p className="font-display text-2xl">{totalCount}</p>
            </div>
            <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
              <p className="text-sm text-[var(--text-tertiary)] mb-1">User accounts</p>
              <p className="font-display text-2xl">{userSubscribers.length}</p>
            </div>
            <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
              <p className="text-sm text-[var(--text-tertiary)] mb-1">Email only</p>
              <p className="font-display text-2xl">{emailSubscribers.filter(s => s.status === 'active').length}</p>
            </div>
            <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
              <p className="text-sm text-[var(--text-tertiary)] mb-1">Pending</p>
              <p className="font-display text-2xl">{pendingCount}</p>
            </div>
          </div>

          {/* Search and filters */}
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search subscribers..."
                className="input pl-10"
              />
            </div>
            
            <div className="flex gap-1 p-1 bg-[var(--bg-secondary)] rounded-lg">
              {[
                { id: 'all', label: 'All' },
                { id: 'users', label: 'Users' },
                { id: 'email', label: 'Email' },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setTab(id as typeof tab)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-all ${
                    tab === id
                      ? 'bg-[var(--bg-primary)] shadow-sm font-medium'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin text-[var(--text-tertiary)]" />
            </div>
          ) : totalCount === 0 ? (
            <div className="text-center py-16 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
              <UserPlus size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
              <h2 className="font-display text-xl mb-2">No subscribers yet</h2>
              <p className="text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
                Share your profile to start building your audience
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* User subscribers */}
              {(tab === 'all' || tab === 'users') && filteredUserSubs.map((sub) => (
                <div 
                  key={sub.id}
                  className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]"
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
                        className="font-medium hover:text-[var(--accent)]"
                      >
                        {sub.subscriber.display_name || sub.subscriber.username}
                      </Link>
                      <p className="text-sm text-[var(--text-tertiary)]">
                        @{sub.subscriber.username}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                      <Users size={12} />
                      {sub.tier}
                    </span>
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">
                      {formatDate(sub.created_at)}
                    </p>
                  </div>
                </div>
              ))}

              {/* Email subscribers */}
              {(tab === 'all' || tab === 'email') && filteredEmailSubs.map((sub) => (
                <div 
                  key={sub.id}
                  className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center">
                      <Mail size={18} className="text-[var(--text-tertiary)]" />
                    </div>
                    <div>
                      <p className="font-medium">{sub.email}</p>
                      {sub.name && (
                        <p className="text-sm text-[var(--text-tertiary)]">{sub.name}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
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
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
