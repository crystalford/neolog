'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Users, Mail, Download, Upload, Search, Filter,
  TrendingUp, UserPlus, UserMinus, Loader2, Send
} from 'lucide-react'

interface Subscriber {
  id: string
  email: string
  created_at: string
  status: 'active' | 'unsubscribed' | 'bounced'
  email_new_posts: boolean
  email_weekly_digest: boolean
  source: string
}

export function SubscriberManager() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [filteredSubscribers, setFilteredSubscribers] = useState<Subscriber[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    unsubscribed: 0,
    bounced: 0,
    newThisMonth: 0,
  })

  const supabase = createClient()

  useEffect(() => {
    loadSubscribers()
  }, [])

  useEffect(() => {
    filterSubscribers()
  }, [subscribers, searchQuery, statusFilter])

  const loadSubscribers = async () => {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data, error } = await supabase
        .from('email_subscribers')
        .select('*')
        .eq('creator_id', session.user.id)
        .order('created_at', { ascending: false })

      if (error) throw error

      if (data) {
        setSubscribers(data)

        // Calculate stats
        const now = new Date()
        const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())

        setStats({
          total: data.length,
          active: data.filter(s => s.status === 'active').length,
          unsubscribed: data.filter(s => s.status === 'unsubscribed').length,
          bounced: data.filter(s => s.status === 'bounced').length,
          newThisMonth: data.filter(s => new Date(s.created_at) > monthAgo).length,
        })
      }
    } catch (error) {
      console.error('Error loading subscribers:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterSubscribers = () => {
    let filtered = subscribers

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(s => s.status === statusFilter)
    }

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(s =>
        s.email.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    setFilteredSubscribers(filtered)
  }

  const exportSubscribers = () => {
    const csv = [
      ['Email', 'Status', 'New Posts', 'Weekly Digest', 'Joined Date', 'Source'].join(','),
      ...filteredSubscribers.map(s => [
        s.email,
        s.status,
        s.email_new_posts ? 'Yes' : 'No',
        s.email_weekly_digest ? 'Yes' : 'No',
        new Date(s.created_at).toLocaleDateString(),
        s.source || 'Direct',
      ].join(',')),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `subscribers-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-3">
            <Users size={32} />
            Subscribers
          </h1>
          <p className="text-[var(--text-secondary)] mt-2">
            Manage your email subscribers and preferences
          </p>
        </div>
        <button
          onClick={exportSubscribers}
          className="btn btn-secondary"
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
        <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Users size={20} className="text-blue-500" />
            </div>
            <span className="text-sm text-[var(--text-tertiary)]">Total</span>
          </div>
          <p className="text-3xl font-display font-bold">{stats.total}</p>
        </div>

        <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Mail size={20} className="text-green-500" />
            </div>
            <span className="text-sm text-[var(--text-tertiary)]">Active</span>
          </div>
          <p className="text-3xl font-display font-bold">{stats.active}</p>
        </div>

        <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <TrendingUp size={20} className="text-purple-500" />
            </div>
            <span className="text-sm text-[var(--text-tertiary)]">This Month</span>
          </div>
          <p className="text-3xl font-display font-bold">{stats.newThisMonth}</p>
        </div>

        <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
              <UserMinus size={20} className="text-yellow-500" />
            </div>
            <span className="text-sm text-[var(--text-tertiary)]">Unsubscribed</span>
          </div>
          <p className="text-3xl font-display font-bold">{stats.unsubscribed}</p>
        </div>

        <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
              <Mail size={20} className="text-red-500" />
            </div>
            <span className="text-sm text-[var(--text-tertiary)]">Bounced</span>
          </div>
          <p className="text-3xl font-display font-bold">{stats.bounced}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by email..."
            className="input input-with-icon w-full"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input w-full sm:w-48"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="unsubscribed">Unsubscribed</option>
          <option value="bounced">Bounced</option>
        </select>
      </div>

      {/* Subscribers list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={32} className="animate-spin text-[var(--text-tertiary)]" />
        </div>
      ) : filteredSubscribers.length === 0 ? (
        <div className="text-center py-16 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-light)]">
          <Users size={48} className="mx-auto mb-4 text-[var(--text-tertiary)] opacity-50" />
          <h3 className="font-semibold mb-2">
            {searchQuery || statusFilter !== 'all' ? 'No subscribers match your filters' : 'No subscribers yet'}
          </h3>
          <p className="text-sm text-[var(--text-secondary)]">
            {!searchQuery && statusFilter === 'all' && 'Subscribers will appear here when people sign up'}
          </p>
        </div>
      ) : (
        <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-light)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-light)] bg-[var(--bg-tertiary)]">
                  <th className="px-6 py-4 text-left text-sm font-semibold">Email</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold">Preferences</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold">Joined</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-light)]">
                {filteredSubscribers.map(subscriber => (
                  <tr key={subscriber.id} className="hover:bg-[var(--bg-tertiary)] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Mail size={16} className="text-[var(--text-tertiary)]" />
                        <span className="font-medium">{subscriber.email}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          subscriber.status === 'active'
                            ? 'bg-green-500/10 text-green-500'
                            : subscriber.status === 'unsubscribed'
                            ? 'bg-yellow-500/10 text-yellow-500'
                            : 'bg-red-500/10 text-red-500'
                        }`}
                      >
                        {subscriber.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        {subscriber.email_new_posts && (
                          <span className="px-2 py-1 text-xs rounded bg-[var(--bg-primary)] border border-[var(--border-light)]">
                            New posts
                          </span>
                        )}
                        {subscriber.email_weekly_digest && (
                          <span className="px-2 py-1 text-xs rounded bg-[var(--bg-primary)] border border-[var(--border-light)]">
                            Weekly
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">
                      {new Date(subscriber.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">
                      {subscriber.source || 'Direct'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination would go here */}
          <div className="px-6 py-4 border-t border-[var(--border-light)] text-sm text-[var(--text-tertiary)]">
            Showing {filteredSubscribers.length} of {subscribers.length} subscribers
          </div>
        </div>
      )}
    </div>
  )
}
