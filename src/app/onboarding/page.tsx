/**
 * Onboarding — four-step setup for first-time operator. Background,
 * voice profile reference corpus, privacy defaults, ready. Minimal
 * canon chrome (no masthead — outside (app) shell).
 */
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { LogoMark } from '@/components/Shell'

const STEPS = [
  { label: 'Profile',  h1Top: 'Set the',          h1Bot: 'ground state.',           desc: 'Tell the system who you are — background, current focus, voice signature. The extractor reads this on every run.' },
  { label: 'Voice',    h1Top: 'Your voice,',      h1Bot: 'preserved verbatim.',     desc: 'Reference corpus auto-populates from your existing transcripts. You can tune cadence + register later.' },
  { label: 'Privacy',  h1Top: 'Private',          h1Bot: 'by default.',             desc: 'Default visibility for new vlogs: Private. Override per-vlog from the detail page. Public-share URL: neolog.ai/{handle}.' },
  { label: 'Ready',    h1Top: 'You’re',      h1Bot: 'ready.',                  desc: 'Drop a vlog from Vlogs. The pipeline will transcribe and extract threads in the background.' },
]

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const cur = STEPS[step]

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: 'var(--font-body)',
    }}>
      {/* Minimal top bar */}
      <header style={{
        padding: '24px 56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--line)',
        maxWidth: 1280, margin: '0 auto',
      }}>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 11, color: 'var(--fg)', textDecoration: 'none' }}>
          <LogoMark size={22}/>
          <span style={{ fontSize: 19, fontWeight: 500, letterSpacing: '-0.5px' }}>neolog</span>
        </Link>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.8,
          color: 'var(--fg-3)', textTransform: 'uppercase',
        }}>
          {String(step + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}
        </span>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '80px 56px' }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 3.2,
          textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 22,
          display: 'inline-flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ width: 28, height: 1, background: 'var(--line-3)' }}/>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sig)', boxShadow: '0 0 8px var(--sig-glow)' }}/>
          Onboarding · {cur.label}
        </div>

        <h1 style={{
          fontFamily: 'var(--font-body)', fontWeight: 400,
          fontSize: 'clamp(48px, 6vw, 76px)', lineHeight: 1.0,
          letterSpacing: '-2.6px', color: 'var(--fg)',
          margin: '0 0 28px', textWrap: 'balance',
        }}>
          {cur.h1Top}<br/>{cur.h1Bot}<span style={{ color: 'var(--sig)' }}>.</span>
        </h1>

        <p style={{
          fontSize: 18, lineHeight: 1.55, color: 'var(--fg-1)',
          maxWidth: 580, letterSpacing: '-0.2px', marginBottom: 36,
        }}>{cur.desc}</p>

        <div style={{ display: 'flex', gap: 10, marginBottom: 40 }}>
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} className="canon-btn ghost">Back</button>
          )}
          {step < STEPS.length - 1 ? (
            <button onClick={() => setStep(step + 1)} className="canon-btn primary">
              Next
              <span className="ico"><svg viewBox="0 0 14 14"><path d="M3 7 L11 7 M8 4 L11 7 L8 10"/></svg></span>
            </button>
          ) : (
            <Link href="/" className="canon-btn primary">
              Open Timeline
              <span className="ico"><svg viewBox="0 0 14 14"><path d="M3 7 L11 7 M8 4 L11 7 L8 10"/></svg></span>
            </Link>
          )}
        </div>

        {/* Step progress */}
        <div style={{ display: 'flex', gap: 6 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 2, borderRadius: 1,
              background: i <= step ? 'var(--sig)' : 'var(--line-2)',
              boxShadow: i <= step ? '0 0 6px var(--sig-glow)' : 'none',
              transition: 'all 0.3s',
            }}/>
          ))}
        </div>
      </main>
    </div>
  )
}
