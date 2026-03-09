import Link from 'next/link'

const entityCards = [
  { emoji: '💡', label: 'AI documentary idea', type: 'Idea', session: '2h ago' },
  { emoji: '🏗', label: 'Neolog', type: 'Project', session: '23 sessions' },
  { emoji: '❓', label: 'How do I sell without selling?', type: 'Question', session: '5d ago' },
  { emoji: '🎯', label: 'Ship uploads this week', type: 'Commitment', session: '1d ago' },
  { emoji: '📖', label: 'The Crystal Ford', type: 'Creative', session: '3 sessions' },
]

export default function HomePage() {
  return (
    <div
      className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-x-hidden"
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      {/* Ambient bloom */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: '-15%',
          right: '-5%',
          width: '55vw',
          height: '55vh',
          background: 'radial-gradient(ellipse, rgba(124,106,245,0.09) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          bottom: '-10%',
          left: '-5%',
          width: '40vw',
          height: '40vh',
          background: 'radial-gradient(ellipse, rgba(124,106,245,0.05) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Nav */}
      <header
        style={{
          position: 'relative',
          zIndex: 10,
          borderBottom: '1px solid var(--border-light)',
          background: 'rgba(9,9,16,0.8)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: '26px', height: '26px', borderRadius: '5px',
              background: 'var(--text-primary)', color: 'var(--text-inverse)',
              fontWeight: 700, fontSize: '13px', letterSpacing: '-0.02em',
              flexShrink: 0,
            }}>N</span>
            <span style={{ fontWeight: 600, fontSize: '15px', letterSpacing: '-0.02em' }}>Neolog</span>
          </div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Link href="/login" style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '0.4rem 0.75rem', borderRadius: '6px', textDecoration: 'none', transition: 'color 0.15s' }}>
              Sign in
            </Link>
            <Link href="/login" style={{
              fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)',
              padding: '0.4rem 0.9rem', borderRadius: '6px',
              border: '1px solid var(--border-medium)',
              background: 'rgba(255,255,255,0.04)',
              textDecoration: 'none', transition: 'all 0.15s',
            }}>
              Get started →
            </Link>
          </nav>
        </div>
      </header>

      {/* Master Hero Section */}
      <section style={{ position: 'relative', zIndex: 1, padding: '5rem 2rem 4rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '6rem' }}>

          {/* Top of Hero: Text + Floating Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '3rem', alignItems: 'center' }}>
            {/* Left — Editorial text */}
            <div>
              <p style={{
                fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase',
                color: 'var(--text-tertiary)', marginBottom: '1.75rem', fontWeight: 600,
              }}>
                Personal Intelligence System
              </p>

              <h1 style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(3rem, 5vw, 5.5rem)',
                fontWeight: 400,
                lineHeight: 1.08,
                letterSpacing: '-0.02em',
                marginBottom: '1.5rem',
                color: 'var(--text-primary)',
              }}>
                Your thinking,<br />
                <span style={{
                  background: 'linear-gradient(135deg, #a78bfa 0%, #7c6af5 50%, #c4b5fd 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>
                  made permanent.
                </span>
              </h1>

              <p style={{ fontSize: '17px', color: 'var(--text-secondary)', lineHeight: 1.65, maxWidth: '480px', marginBottom: '2.5rem' }}>
                Talk. Record. Neolog listens to everything you create and builds a living map of your thinking — ideas, projects, questions, patterns.
              </p>

              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <Link href="/dashboard" style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                  padding: '0.7rem 1.4rem', borderRadius: '8px',
                  background: 'var(--accent)', color: '#fff',
                  fontWeight: 500, fontSize: '14px', textDecoration: 'none',
                  boxShadow: '0 0 24px -4px rgba(124,106,245,0.5)',
                  transition: 'all 0.2s',
                }}>
                  Start logging →
                </Link>
                <div style={{
                  display: 'inline-flex', alignItems: 'center',
                  padding: '0.7rem 1.4rem', borderRadius: '8px',
                  border: '1px solid var(--border-medium)',
                  color: 'var(--text-secondary)', fontSize: '14px',
                  background: 'rgba(255,255,255,0.03)',
                }}>
                  Built for builders.
                </div>
              </div>
            </div>

            {/* Right — Floating entity cards */}
            <div style={{ position: 'relative', height: '400px' }}>
              {entityCards.map((card, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    background: 'rgba(13,13,22,0.8)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid var(--border-light)',
                    borderRadius: '10px',
                    padding: '0.75rem 1rem',
                    width: '260px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    // Staggered positions
                    top: `${[12, 80, 148, 220, 292][i]}px`,
                    left: `${[20, 60, 10, 50, 25][i]}px`,
                    transform: `rotate(${[-1.5, 1, -0.5, 1.2, -1][i]}deg)`,
                    zIndex: entityCards.length - i,
                    transition: 'transform 0.3s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '14px' }}>{card.emoji}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500, letterSpacing: '-0.01em' }}>{card.label}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span style={{
                      fontSize: '10px', padding: '0.1rem 0.4rem', borderRadius: '4px',
                      background: 'rgba(124,106,245,0.12)', color: 'var(--accent)',
                      fontWeight: 500,
                    }}>{card.type}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>{card.session}</span>
                  </div>
                </div>
              ))}

              {/* Subtle glow behind cards */}
              <div aria-hidden style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '300px', height: '300px',
                background: 'radial-gradient(circle, rgba(124,106,245,0.08) 0%, transparent 70%)',
                pointerEvents: 'none',
              }} />
            </div>
          </div>

          {/* Bottom of Hero: How it works (integrated) */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '3rem',
            paddingTop: '4rem', borderTop: '1px solid var(--border-light)'
          }}>
            {[
              { num: '01', title: 'Record', desc: 'Drop a raw video, voice note, or type a brain dump. No editing, no formatting required.' },
              { num: '02', title: 'Extract', desc: 'Neolog transcribes, then pulls out ideas, projects, questions, goals, and patterns across every session.' },
              { num: '03', title: 'Publish', desc: 'Social posts, portfolio entries, and a bio update themselves. The system narrates you.' },
            ].map((step) => (
              <div key={step.num}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '0.75rem', letterSpacing: '0.05em' }}>{step.num}</p>
                <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '0.5rem', letterSpacing: '-0.01em' }}>{step.title}</h3>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.65 }}>{step.desc}</p>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* Structured Graph Section (2 columns) */}
      <section style={{ position: 'relative', zIndex: 1, borderTop: '1px solid var(--border-light)', background: 'rgba(13,13,22,0.6)' }}>
        <div style={{
          maxWidth: '1200px', margin: '0 auto', padding: '6rem 2rem',
          display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 1.5fr', gap: '4rem', alignItems: 'center'
        }}>
          <div>
            <p style={{ fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '1rem', fontWeight: 600 }}>What gets extracted</p>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.5rem, 3vw, 3rem)', fontWeight: 400, marginBottom: '1.5rem', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              Everything you say, permanently structured.
            </h2>
            <p style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.65 }}>
              Instead of unstructured notes drifting into the void, Neolog detects what matters and catalogs it into your personal graph. 
              Searchable, actionable, and forever accumulating.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            {[
              { emoji: '💡', label: 'Ideas', desc: 'Raw sparks, captured.' },
              { emoji: '🏗', label: 'Projects', desc: 'What you\'re building.' },
              { emoji: '❓', label: 'Questions', desc: 'What you\'re wrestling with.' },
              { emoji: '🤝', label: 'People', desc: 'Who matters in your work.' },
              { emoji: '🎯', label: 'Commitments', desc: 'What you said you\'d do.' },
              { emoji: '📖', label: 'Creative Works', desc: 'Books, scripts, essays building.' },
            ].map((item) => (
              <div key={item.label} style={{
                padding: '1.25rem 1.5rem',
                border: '1px solid var(--border-light)',
                borderRadius: '8px',
                background: 'rgba(13,13,22,0.4)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
              }}>
                <span style={{ fontSize: '20px', display: 'block', marginBottom: '0.5rem' }}>{item.emoji}</span>
                <p style={{ fontWeight: 600, fontSize: '14px', marginBottom: '0.25rem' }}>{item.label}</p>
                <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ position: 'relative', zIndex: 1, borderTop: '1px solid var(--border-light)', textAlign: 'center', background: 'radial-gradient(100% 100% at 50% 0%, rgba(124,106,245,0.06) 0%, transparent 100%)' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '6rem 2rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 4vw, 3.5rem)', fontWeight: 400, lineHeight: 1.1, marginBottom: '1.5rem', letterSpacing: '-0.02em' }}>
            Stop losing your best thinking.
          </h2>
          <p style={{ fontSize: '16px', color: 'var(--text-secondary)', marginBottom: '2rem', lineHeight: 1.65 }}>
            Every recording, note, and idea — organised, searchable, and working for you.
          </p>
          <Link href="/dashboard" style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '0.8rem 2rem', borderRadius: '8px',
            background: 'var(--accent)', color: '#fff',
            fontWeight: 500, fontSize: '15px', textDecoration: 'none',
            boxShadow: '0 0 32px -6px rgba(124,106,245,0.5)',
          }}>
            Start logging — it's free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--border-light)', position: 'relative', zIndex: 1 }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Neolog 2026</span>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            {['Privacy', 'Terms'].map(l => (
              <Link key={l} href="#" style={{ fontSize: '12px', color: 'var(--text-tertiary)', textDecoration: 'none' }}>{l}</Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
