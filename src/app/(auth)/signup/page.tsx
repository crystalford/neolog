'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Mail, Lock, User, Loader2 } from 'lucide-react'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // Check if username is available
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('username')
        .eq('username', username.toLowerCase())
        .single()

      if (existingUser) {
        setError('Username is already taken')
        setLoading(false)
        return
      }

      // Sign up
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username.toLowerCase(),
          },
        },
      })

      if (signUpError) {
        setError(signUpError.message)
      } else {
        setSuccess(true)
      }
    } catch (err) {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="animate-fade-up text-center">
        <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-6">
          <Mail size={28} className="text-success" />
        </div>
        <h1 className="font-display text-3xl mb-2">Check your email</h1>
        <p className="text-text-muted mb-8">
          We've sent a confirmation link to <strong className="text-text-primary">{email}</strong>
        </p>
        <Link href="/login" className="text-accent hover:underline text-sm">
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="animate-fade-up">
      <h1 className="font-display text-3xl text-center mb-2">Create your account</h1>
      <p className="text-text-muted text-center mb-8">Start publishing in seconds</p>

      {error && (
        <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSignup} className="space-y-4">
        <div>
          <label htmlFor="username" className="block text-sm text-text-muted mb-1.5">
            Username
          </label>
          <div className="relative">
            <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="yourname"
              className="input pl-10"
              required
              minLength={3}
              maxLength={30}
            />
          </div>
          <p className="text-xs text-text-muted mt-1.5">
            neolog.com/<span className="text-accent">{username || 'yourname'}</span>
          </p>
        </div>

        <div>
          <label htmlFor="email" className="block text-sm text-text-muted mb-1.5">
            Email
          </label>
          <div className="relative">
            <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="input pl-10"
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="block text-sm text-text-muted mb-1.5">
            Password
          </label>
          <div className="relative">
            <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input pl-10"
              required
              minLength={8}
            />
          </div>
          <p className="text-xs text-text-muted mt-1.5">
            At least 8 characters
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary w-full py-3 flex items-center justify-center gap-2"
        >
          {loading && <Loader2 size={18} className="animate-spin" />}
          Create account
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-text-muted">
        Already have an account?{' '}
        <Link href="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
