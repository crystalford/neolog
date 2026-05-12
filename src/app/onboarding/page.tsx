/**
 * Onboarding — four-step setup for first-time operator. Background, voice
 * profile reference corpus, privacy defaults, ready. UI staged.
 */
'use client'

import { useState } from 'react'
import { Logo } from '@/components/Logo'

const STEPS = [
  { label: 'Profile', desc: 'Tell the system who you are — background, current focus, voice signature. The extractor reads this on every run.' },
  { label: 'Voice', desc: 'Reference corpus auto-populates from your existing transcripts. You can tune cadence + register later.' },
  { label: 'Privacy', desc: 'Default visibility for new vlogs: Private. Override per-vlog from the detail page. Public-share URL: neolog.ai/{handle}.' },
  { label: 'Ready', desc: 'Drop in a vlog from Capture. The pipeline will transcribe and extract threads in the background.' },
]

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const current = STEPS[step]
  return (
    <div className="landing-page">
      <div className="topbar">
        <a href="/" className="hero-logo">
          <Logo size={32} />
          <span className="wordmark">neolog</span>
        </a>
        <div className="nav-right">
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: 1.5, color: 'var(--bone-3)' }}>
            {String(step + 1).padStart(2, '0')} / 04
          </span>
        </div>
      </div>

      <section className="hero-section" style={{ maxWidth: 640 }}>
        <div className="hero-eyebrow">Onboarding · {current.label}</div>
        <h1 className="hero-h1" style={{ fontSize: 'clamp(40px, 5vw, 60px)' }}>
          {step === 0 && <>Set the<br />ground state.</>}
          {step === 1 && <>Your voice,<br />preserved verbatim.</>}
          {step === 2 && <>Private by default.</>}
          {step === 3 && <>You're ready.</>}
        </h1>
        <p className="hero-lead">{current.desc}</p>

        <div className="cta-row">
          {step > 0 && <button onClick={() => setStep(step - 1)} className="cta secondary">Back</button>}
          {step < STEPS.length - 1 ? (
            <button onClick={() => setStep(step + 1)} className="cta primary">Next</button>
          ) : (
            <a href="/timeline" className="cta primary">Open Timeline</a>
          )}
        </div>

        <div style={{ marginTop: 36, display: 'flex', gap: 6 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              flex: 1,
              height: 2,
              background: i <= step ? 'var(--bone)' : 'var(--line-warm)',
              borderRadius: 1,
              transition: 'background 0.3s',
            }} />
          ))}
        </div>
      </section>
    </div>
  )
}
