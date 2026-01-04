'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { 
  Users, Check, X, Loader2, FileText, Clock 
} from 'lucide-react'

type Invitation = {
  id: string
  post_id: string
  role: string
  created_at: string
  post: {
    title: string
    slug: string
    author: {
      username: string
      display_name: string | null
      avatar_url: string | null
    }
  }
}

export default function InvitationsPage() {
  const [loading, setLoading] = useState(true)
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [processing, setProcessing] = useState<string | null>(null)
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadInvitations()
  }, [])

  const loadInvitations = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      router.push('/login?redirect=/invitations')
      return
    }

    const { data } = await supabase
      .from('post_coauthors')
      .select(`
        id,
        post_id,
        role,
        created_at,
        post:posts(
          title,
          slug,
          author:profiles(username, display_name, avatar_url)
        )
      `)
      .eq('user_id', session.user.id)
      .eq('accepted', false)
      .order('created_at', { ascending: false })

    if (data) {
      setInvitations(data as unknown as Invitation[])
    }

    setLoading(false)
  }

  const handleAccept = async (invitationId: string) => {
    setProcessing(invitationId)
    
    await supabase
      .from('post_coauthors')
      .update({ accepted: true })
      .eq('id', invitationId)

    setInvitations(invitations.filter(i => i.id !== invitationId))
    setProcessing(null)
  }

  const handleDecline = async (invitationId: string) => {
    setProcessing(invitationId)
    
    await supabase
      .from('post_coauthors')
      .delete()
      .eq('id', invitationId)

    setInvitations(invitations.filter(i => i.id !== invitationId))
    setProcessing(null)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const roleLabels: Record<string, string> = {
    coauthor: 'Co-author',
    contributor: 'Contributor',
    editor: 'Editor',
  }

  return (
    <>
      <main className="pt-16 pb-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="flex items-center gap-4 pt-8 mb-8">
            <div className="w-12 h-12 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
              <Users size={24} className="text-[var(--accent)]" />
            </div>
            <div>
              <h1 className="font-display text-3xl">Invitations</h1>
              <p className="text-[var(--text-secondary)]">
                Co-author invitations from other writers
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin text-[var(--text-tertiary)]" />
            </div>
          ) : invitations.length === 0 ? (
            <div className="text-center py-16 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
              <Users size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
              <h2 className="font-display text-xl mb-2">No pending invitations</h2>
              <p className="text-[var(--text-secondary)]">
                When someone invites you to co-author a post, it will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {invitations.map(invitation => (
                <div
                  key={invitation.id}
                  className="p-5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <FileText size={16} className="text-[var(--text-tertiary)]" />
                        <span className="text-sm text-[var(--text-secondary)]">
                          {roleLabels[invitation.role] || invitation.role} invitation
                        </span>
                      </div>
                      
                      <h3 className="font-medium text-lg mb-2">
                        {invitation.post.title}
                      </h3>
                      
                      <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
                        <Link 
                          href={`/${invitation.post.author.username}`}
                          className="flex items-center gap-2 hover:text-[var(--accent)]"
                        >
                          {invitation.post.author.avatar_url ? (
                            <img 
                              src={invitation.post.author.avatar_url} 
                              className="w-5 h-5 rounded-full" 
                            />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-xs">
                              {(invitation.post.author.display_name || invitation.post.author.username)[0].toUpperCase()}
                            </div>
                          )}
                          {invitation.post.author.display_name || invitation.post.author.username}
                        </Link>
                        
                        <span className="flex items-center gap-1 text-[var(--text-tertiary)]">
                          <Clock size={12} />
                          {formatDate(invitation.created_at)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => handleDecline(invitation.id)}
                        disabled={processing === invitation.id}
                        className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--error)] transition-colors"
                        title="Decline"
                      >
                        {processing === invitation.id ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <X size={18} />
                        )}
                      </button>
                      <button
                        onClick={() => handleAccept(invitation.id)}
                        disabled={processing === invitation.id}
                        className="btn btn-primary btn-sm"
                      >
                        {processing === invitation.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Check size={14} />
                        )}
                        Accept
                      </button>
                    </div>
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


