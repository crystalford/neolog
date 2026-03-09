import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/Header'
import { ArrowRight, Upload, Zap, Layers, CheckCircle2 } from 'lucide-react'

export default async function Home() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  return (
    <div className="bg-[var(--bg-primary)] min-h-screen">
      <Header />
      <main className="pt-14">

        {/* ── HERO ─────────────────────────────────────────── */}
        <section className="relative flex flex-col items-center justify-center px-6 py-32 md:py-44 max-w-5xl mx-auto text-center overflow-hidden">
          {/* Grid bg */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />

          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-card)] border border-[var(--border-medium)] mb-8 backdrop-blur-sm">
              <Zap size={13} className="text-[var(--accent)]" />
              <span className="text-xs font-medium text-[var(--text-secondary)]">An extension of the mind</span>
            </div>

            <h1 className="font-display text-6xl md:text-8xl font-bold leading-[1.05] tracking-tighter text-[var(--text-primary)] mb-6">
              Neolog
            </h1>

            <p className="text-lg md:text-2xl text-[var(--text-secondary)] mb-4 max-w-2xl mx-auto leading-relaxed font-light">
              Talk. Record. Log.
              <br />
              <span className="text-[var(--text-primary)]">Neolog listens to everything you create and builds a living map of your thinking.</span>
            </p>

            <p className="text-base text-[var(--text-tertiary)] mb-12 max-w-xl mx-auto">
              Drop in a raw, unedited video. Neolog transcribes it, extracts your ideas, projects, questions, and patterns — and accumulates them across every session.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href={session ? '/dashboard/log' : '/signup'}
                className="btn btn-primary btn-lg group"
              >
                {session ? 'Open your log' : 'Get started free'}
                <ArrowRight size={18} className="ml-2 transition-transform group-hover:translate-x-1" />
              </Link>
              {!session && (
                <Link href="/login" className="btn btn-secondary btn-lg">
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </section>

        {/* ── THE PROBLEM ─────────────────────────────────── */}
        <section className="px-6 py-20 max-w-4xl mx-auto text-center">
          <h2 className="font-display text-4xl md:text-5xl font-bold mb-6 tracking-tight leading-tight">
            You create more than you publish.
          </h2>
          <p className="text-lg text-[var(--text-secondary)] max-w-2xl mx-auto leading-relaxed">
            Your best ideas happen in car rides, shower thoughts, and 2AM recordings. They turn into raw video files on a hard drive. They never become anything — not because the ideas aren't good, but because <span className="text-[var(--text-primary)]">you are the bottleneck.</span>
          </p>
          <p className="text-lg text-[var(--text-secondary)] mt-6 max-w-2xl mx-auto leading-relaxed">
            Neolog removes you from that equation.
          </p>
        </section>

        {/* ── HOW IT WORKS ─────────────────────────────────── */}
        <section className="px-6 py-24 max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-display text-4xl md:text-5xl font-bold mb-4 tracking-tight">How it works</h2>
            <p className="text-[var(--text-secondary)]">Three steps. No editing required.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                step: '01',
                icon: Upload,
                title: 'Record & Upload',
                desc: 'Drop in a raw video or audio file — phone recording, voice memo, anything. No structure needed. Neolog handles gigabyte-scale files with resumable upload so nothing gets lost.',
                color: 'var(--accent)',
              },
              {
                step: '02',
                icon: Zap,
                title: 'Synthesize',
                desc: 'AI transcribes the audio, then extracts ideas, projects, questions, decisions, commitments, people, patterns. These become entities in your Knowledge Graph — and they accumulate across every session.',
                color: 'var(--accent-purple)',
              },
              {
                step: '03',
                icon: Layers,
                title: 'Publish & Represent',
                desc: 'Neolog generates social posts about your work (as an outside observer, not you talking about yourself), builds project portfolio entries, and assembles video clips — all from evidence in your logs.',
                color: 'var(--accent-cyan)',
              },
            ].map(({ step, icon: Icon, title, desc, color }) => (
              <div
                key={step}
                className="group relative p-8 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-medium)] hover:border-[var(--border-heavy)] transition-all duration-300"
                style={{ '--card-color': color } as React.CSSProperties}
              >
                <div className="text-[10px] font-mono text-[var(--text-tertiary)] tracking-widest mb-4">{step}</div>
                <div
                  className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{ background: `${color}18`, border: `1px solid ${color}30` }}
                >
                  <Icon size={20} style={{ color }} />
                </div>
                <h3 className="font-display text-xl font-semibold mb-3 text-[var(--text-primary)]">{title}</h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── WHAT IT EXTRACTS ─────────────────────────────── */}
        <section className="px-6 py-24 bg-[var(--bg-secondary)] border-y border-[var(--border-medium)]">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <h2 className="font-display text-4xl md:text-5xl font-bold mb-4 tracking-tight">
                Everything you say. Permanently structured.
              </h2>
              <p className="text-[var(--text-secondary)] max-w-2xl mx-auto">
                Neolog doesn't create categories for you to fill in. It listens to how you naturally talk and extracts the things that matter.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { emoji: '💡', label: 'Ideas', desc: 'Novel connections & sparks' },
                { emoji: '🏗', label: 'Projects', desc: 'Everything you are actively building' },
                { emoji: '❓', label: 'Questions', desc: 'The "what ifs" you ask into the void' },
                { emoji: '🎯', label: 'Commitments', desc: 'Promises tracked across sessions' },
                { emoji: '🔑', label: 'Decisions', desc: 'Choices made and the logic behind them' },
                { emoji: '🤝', label: 'People', desc: 'Who you mention and how' },
                { emoji: '⚡', label: 'Energy', desc: 'Flow states and friction patterns' },
                { emoji: '🔄', label: 'Habits', desc: 'What you do and want to change' },
                { emoji: '🚧', label: 'Blockers', desc: 'What\'s stopping you from moving' },
                { emoji: '🧠', label: 'Beliefs', desc: 'Values revealed by what you react to' },
                { emoji: '📈', label: 'Content ideas', desc: 'Articles, threads, video seeds' },
                { emoji: '🔀', label: 'Contradictions', desc: 'When you argue against yourself' },
              ].map(({ emoji, label, desc }) => (
                <div key={label} className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors">
                  <div className="text-xl mb-2">{emoji}</div>
                  <div className="text-sm font-semibold text-[var(--text-primary)] mb-1">{label}</div>
                  <div className="text-xs text-[var(--text-tertiary)] leading-snug">{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── THE OUTPUT ───────────────────────────────────── */}
        <section className="px-6 py-24 max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="font-display text-4xl md:text-5xl font-bold mb-6 tracking-tight leading-tight">
                It describes you.<br />
                <span className="text-[var(--accent)]">You don't describe yourself.</span>
              </h2>
              <p className="text-[var(--text-secondary)] leading-relaxed mb-6">
                Most people who do great things can't sell themselves. They're too close to the work, too uncomfortable with self-promotion, too busy building to stop and describe what they built.
              </p>
              <p className="text-[var(--text-secondary)] leading-relaxed mb-8">
                Neolog generates an outside-observer account of your work — your portfolio, your bio, your social presence — from the evidence in your logs. Accurate. Updated. In your voice.
              </p>
              <ul className="space-y-2">
                {[
                  'Social posts written about your work (not by you)',
                  'Project portfolio entries with case studies',
                  'A living bio that updates with each session',
                  'Video clips assembled from your best moments',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]">
                    <CheckCircle2 size={15} className="text-[var(--success)] mt-0.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-medium)]">
              <div className="text-xs text-[var(--text-tertiary)] mb-3 font-mono">AUTO-GENERATED POST · X</div>
              <p className="text-sm text-[var(--text-primary)] leading-relaxed mb-4">
                "He's been building Neolog for three months — an AI that takes his raw, unedited recordings and turns them into structured intelligence. Today he's working on the pipeline that strips audio from 4GB iPhone videos and feeds them into Whisper for transcription."
              </p>
              <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
                Generated from Mar 9 morning log · pending approval
              </div>
            </div>
          </div>
        </section>

        {/* ── FOR WHO ──────────────────────────────────────── */}
        <section className="px-6 py-20 max-w-4xl mx-auto text-center">
          <h2 className="font-display text-4xl font-bold mb-6 tracking-tight">
            Built for people who think faster than they publish.
          </h2>
          <p className="text-[var(--text-secondary)] text-lg max-w-2xl mx-auto leading-relaxed">
            Builders. Founders who are also making things. Creators who are drowning in raw footage. People with too many ideas and not enough time to organize them. If your hard drive is full of recordings that never became anything — Neolog is for you.
          </p>
        </section>

        {/* ── CTA ──────────────────────────────────────────── */}
        <section className="px-6 py-24 max-w-3xl mx-auto">
          <div className="relative overflow-hidden bg-[var(--bg-card)] rounded-2xl border border-[var(--border-medium)] p-12 text-center">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(59,130,246,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(59,130,246,0.05)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
            <div className="relative z-10">
              <h2 className="font-display text-4xl font-bold mb-4 tracking-tight">
                Start logging.
              </h2>
              <p className="text-[var(--text-secondary)] mb-8 max-w-md mx-auto">
                Drop in a video. See what Neolog extracts. No setup, no categories to configure.
              </p>
              <Link
                href={session ? '/dashboard/log' : '/signup'}
                className="btn btn-primary btn-lg group"
              >
                {session ? 'Open your log' : 'Create free account'}
                <ArrowRight size={18} className="ml-2 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </div>
        </section>

        {/* ── FOOTER ───────────────────────────────────────── */}
        <footer className="px-6 py-12 bg-[var(--bg-secondary)] border-t border-[var(--border-medium)]">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <span className="logo-mark">N</span>
              <span className="font-display text-lg font-semibold">Neolog</span>
            </div>
            <nav className="flex flex-wrap items-center gap-6 text-sm text-[var(--text-tertiary)]">
              <Link href="/dashboard/log" className="hover:text-[var(--text-primary)] transition-colors">Log in</Link>
              <Link href="/tos" className="hover:text-[var(--text-primary)] transition-colors">Terms</Link>
              <Link href="/privacy" className="hover:text-[var(--text-primary)] transition-colors">Privacy</Link>
            </nav>
            <p className="text-xs text-[var(--text-tertiary)]">© 2026 Neolog</p>
          </div>
        </footer>

      </main>
    </div>
  )
}
