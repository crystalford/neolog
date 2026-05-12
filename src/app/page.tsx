/**
 * Public landing — neolog.ai/
 *
 * Faithful port of filament-update/landing.html. The pitch + pipeline +
 * features + footer CTA. Lives outside the (app) route group so it doesn't
 * render the dock + capture FAB.
 */
import { Logo } from '@/components/Logo'

export const runtime = 'edge'

export default function LandingPage() {
  return (
    <div className="landing-page">
      <div className="topbar">
        <a href="/" className="hero-logo">
          <Logo size={32} />
          <span className="wordmark">neolog</span>
        </a>
        <div className="nav-right">
          <a href="#how" className="nav-back">How it works</a>
          <a href="/timeline" className="login">Sign in</a>
        </div>
      </div>

      <section className="hero-section">
        <div className="hero-inner">
          <div>
            <div className="hero-eyebrow reveal d2">A personal life graph</div>
            <h1 className="hero-h1 reveal d3">
              Your thinking,<br />
              structured.<br />
              <span className="alive">Owned by you.</span>
            </h1>
            <p className="hero-lead reveal d4">
              Record yourself talking — the system extracts threads, finds patterns across your work, and ships finished pieces back into the world. The graph is yours, complete, and it stays that way.
            </p>
            <div className="cta-row reveal d5">
              <a className="cta primary" href="/timeline">Start a graph</a>
              <a className="cta secondary" href="#how">How it works</a>
            </div>
          </div>
          <HeroGraph />
        </div>
      </section>

      <section className="pitch-section" id="how">
        <div className="pitch-grid">
          <div>
            <div className="pitch-kicker">The premise</div>
            <h2 className="section-h2">The graph <span className="alive">is</span> the system.</h2>
          </div>
          <div className="pitch-body">
            <p><strong>Everything you record accumulates into one structured representation of yourself.</strong> Vlogs, voice notes, projects, ideas, references, the people in your life, the work you're trying to make. All of it. Connected. Owned by you. Exportable.</p>
            <p>The production tools — video essays, articles, X posts, clips — sit on top of the graph as outputs. The graph is the substrate. It's also the point.</p>
            <p>This is the personal timeline you used to have. Then platforms ate it. Now you can build your own again, with depth those platforms never had — because your life isn't content for them, it's the work you're actually doing.</p>
          </div>
        </div>
      </section>

      <section className="pipeline-section">
        <div className="pitch-kicker">How it runs</div>
        <h2 className="section-h2">From voice<br />to shipped piece.</h2>
        <div className="pipeline-grid">
          {PIPELINE.map(step => (
            <div key={step.num} className="pipeline-step" style={{ ['--step-color' as any]: step.color }}>
              <div className="step-num">{step.num}</div>
              <div className="step-name">{step.name}</div>
              <div className="step-desc">{step.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="features-section">
        <div className="pitch-kicker">What you get</div>
        <h2 className="section-h2">Five surfaces. One graph.</h2>
        <div className="features-grid">
          {FEATURES.map(f => (
            <div key={f.name} className="feature" style={{ ['--feat-color' as any]: f.color }}>
              <h3>{f.name}</h3>
              <p>{f.desc}</p>
              <ul>{f.bullets.map(b => <li key={b}>{b}</li>)}</ul>
            </div>
          ))}
        </div>
      </section>

      <section className="footer-cta">
        <div className="pitch-kicker">Start the graph</div>
        <h2 style={{ marginTop: 14 }}>It only gets richer<br />the longer you keep it.</h2>
        <p className="lead">No one else can build this for you, because the value is what you bring to it. Start now and the system will be there with you in five years, ten, longer than any platform.</p>
        <div className="cta-row" style={{ justifyContent: 'center' }}>
          <a className="cta primary" href="/timeline">Open Neolog</a>
        </div>
      </section>

      <footer className="site-footer">
        <div className="credit">Neolog · {new Date().getFullYear()}</div>
        <div className="links">
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
          <a href="#">Contact</a>
        </div>
      </footer>
    </div>
  )
}

const PIPELINE = [
  { num: '01', name: 'Record',     desc: 'A vlog from your phone, a voice note, a screen capture. Up to 5 GB.', color: 'var(--bone-3)' },
  { num: '02', name: 'Extract',    desc: 'Threads, creative elements, clip candidates — three passes, all entered into the graph.', color: 'var(--t-brass)' },
  { num: '03', name: 'Accumulate', desc: 'Threads cluster. Topics ripen as you keep thinking about them. Patterns surface.', color: 'var(--t-violet)' },
  { num: '04', name: 'Bounce',     desc: 'When a cluster matters, the system gathers external sources — articles, primary documents, references.', color: 'var(--t-terra)' },
  { num: '05', name: 'Materialize',desc: 'Video essay, article, X thread, clips, or all four — coordinated drops from the same intelligence.', color: 'var(--sig)' },
]

function HeroGraph() {
  // Constellation of clusters + threads + entities — same visual language as
  // the Graph surface. Topic colors from the territory palette. Soft pulse
  // on the big nodes, edges draw in on load.
  return (
    <div className="hero-graph reveal d4">
      <span className="glow" aria-hidden />
      <svg viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        {/* Edges, drawn first */}
        <g stroke="var(--line-bright)" strokeWidth="1" fill="none" opacity="0.5">
          <line className="edge" x1="250" y1="250" x2="120" y2="140" />
          <line className="edge edge-d2" x1="250" y1="250" x2="380" y2="130" />
          <line className="edge edge-d3" x1="250" y1="250" x2="400" y2="320" />
          <line className="edge edge-d4" x1="250" y1="250" x2="130" y2="380" />
          <line className="edge edge-d5" x1="250" y1="250" x2="280" y2="420" />
          {/* Cluster→thread satellites */}
          <line className="edge edge-d2" x1="120" y1="140" x2="60" y2="90" />
          <line className="edge edge-d3" x1="120" y1="140" x2="170" y2="60" />
          <line className="edge edge-d3" x1="380" y1="130" x2="440" y2="80" />
          <line className="edge edge-d4" x1="380" y1="130" x2="430" y2="200" />
          <line className="edge edge-d5" x1="400" y1="320" x2="450" y2="380" />
          <line className="edge edge-d4" x1="130" y1="380" x2="80" y2="440" />
          {/* Cross-cluster (dashed, weaker) */}
          <line className="edge edge-d6" x1="120" y1="140" x2="380" y2="130" strokeDasharray="3,4" opacity="0.3" />
          <line className="edge edge-d6" x1="130" y1="380" x2="400" y2="320" strokeDasharray="3,4" opacity="0.3" />
        </g>

        {/* Center node — the operator / self */}
        <g className="node">
          <circle cx="250" cy="250" r="48" fill="rgba(236,228,210,0.06)" />
          <circle cx="250" cy="250" r="24" fill="var(--bone)" opacity="0.92" className="node-pulse" />
          <circle cx="250" cy="250" r="24" fill="none" stroke="var(--bone)" strokeWidth="1" opacity="0.4" />
        </g>

        {/* Clusters — topic-colored, larger */}
        <g className="node">
          <circle cx="120" cy="140" r="30" fill="var(--t-brass)" opacity="0.14" />
          <circle cx="120" cy="140" r="18" fill="var(--t-brass)" className="node-pulse" />
        </g>
        <g className="node">
          <circle cx="380" cy="130" r="26" fill="var(--t-violet)" opacity="0.14" />
          <circle cx="380" cy="130" r="14" fill="var(--t-violet)" className="node-pulse-2" />
        </g>
        <g className="node">
          <circle cx="400" cy="320" r="28" fill="var(--t-terra)" opacity="0.14" />
          <circle cx="400" cy="320" r="16" fill="var(--t-terra)" className="node-pulse-3" />
        </g>
        <g className="node">
          <circle cx="130" cy="380" r="24" fill="var(--t-plum)" opacity="0.14" />
          <circle cx="130" cy="380" r="13" fill="var(--t-plum)" className="node-pulse-2" />
        </g>
        <g className="node">
          <circle cx="280" cy="420" r="22" fill="var(--t-sage)" opacity="0.14" />
          <circle cx="280" cy="420" r="11" fill="var(--t-sage)" className="node-pulse" />
        </g>

        {/* Thread satellites — small */}
        <circle cx="60" cy="90" r="5" fill="var(--t-brass)" opacity="0.85" />
        <circle cx="170" cy="60" r="4" fill="var(--t-brass)" opacity="0.75" />
        <circle cx="440" cy="80" r="4" fill="var(--t-violet)" opacity="0.85" />
        <circle cx="430" cy="200" r="4" fill="var(--t-violet)" opacity="0.7" />
        <circle cx="450" cy="380" r="5" fill="var(--t-terra)" opacity="0.85" />
        <circle cx="80" cy="440" r="4" fill="var(--t-plum)" opacity="0.8" />

        {/* Tiny entity dots scattered */}
        <circle cx="200" cy="100" r="2" fill="var(--t-rose)" opacity="0.6" />
        <circle cx="340" cy="180" r="2" fill="var(--t-steel)" opacity="0.6" />
        <circle cx="420" cy="250" r="2" fill="var(--t-teal)" opacity="0.6" />
        <circle cx="320" cy="370" r="2" fill="var(--t-ochre)" opacity="0.6" />
        <circle cx="200" cy="350" r="2" fill="var(--t-moss)" opacity="0.6" />
        <circle cx="100" cy="270" r="2" fill="var(--t-rose)" opacity="0.6" />
      </svg>
    </div>
  )
}

const FEATURES = [
  { name: 'Studio',    desc: 'Where deliberate work lives. Cluster cultivation, materialization, the production engine.', bullets: ['Cluster lifecycle', 'Voice profiles', 'Multi-output drops'], color: 'var(--t-brass)' },
  { name: 'Timeline',  desc: 'The chronological record of your thinking, thread by thread. Searchable. Permanent.', bullets: ['Word-level timestamps', 'Per-territory color', 'Strength scoring'], color: 'var(--t-violet)' },
  { name: 'Posts',     desc: 'Fast outputs. Single quotes, threads, companion drops with long-form pieces.', bullets: ['X / Twitter native', 'Per-thread surfacing', 'Coordinated drops'], color: 'var(--t-sage)' },
  { name: 'Edit',      desc: 'Clip candidates from raw vlogs. Delivery moments where you actually nailed it.', bullets: ['Audio-quality scoring', 'Self-contained moments', 'One-tap ship'], color: 'var(--t-rose)' },
  { name: 'Projects',  desc: 'Creative work — fiction, screenplays, character development. Slower rhythm than the studio.', bullets: ['Long-form accumulation', 'Generative video pipeline', 'Character voice profiles'], color: 'var(--t-plum)' },
  { name: 'Graph',     desc: 'Direct view of the territory. Navigate by entity, topic, project, or time.', bullets: ['Per-territory color', 'Cross-cluster patterns', 'Full export'], color: 'var(--t-steel)' },
]
