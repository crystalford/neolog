import Link from 'next/link'
import { Activity, Shield, Cpu, Database, Fingerprint, Zap, Brain, Target, Flame, Box, ChevronRight, Share2, Unlock } from 'lucide-react'

export default function HomePage() {
  return (
    <div
      className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-x-hidden selection:bg-[var(--accent)] selection:text-white"
      style={{ fontFamily: 'var(--font-sans)', background: '#050508' }}
    >
      {/* Ambient Cyber Bloom */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] right-[-10%] w-[70vw] h-[70vh] rounded-full bg-[radial-gradient(circle,rgba(124,106,245,0.08)_0%,transparent_70%)]" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[50vw] h-[50vh] rounded-full bg-[radial-gradient(circle,rgba(6,182,212,0.05)_0%,transparent_70%)]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] contrast-150 brightness-100" />
      </div>

      {/* Nav */}
      <nav className="relative z-50 border-b border-white/5 bg-black/40 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-lg bg-[var(--accent)] flex items-center justify-center text-white font-black shadow-[0_0_20px_rgba(124,106,245,0.4)]">N</div>
             <span className="font-bold tracking-tighter text-xl">NEOLOG</span>
          </div>
          <div className="flex items-center gap-4">
             <Link href="/login" className="text-sm font-medium text-[var(--text-tertiary)] hover:text-white transition-colors">Sign In</Link>
             <Link href="/login" className="px-5 py-2 rounded-xl bg-white text-black text-sm font-bold hover:bg-white/90 transition-all shadow-[0_0_30px_rgba(255,255,255,0.1)]">
               Initialize Session
             </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 pt-20 pb-32 px-6">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--accent-soft)] border border-[var(--accent)]/20">
               <Activity size={12} className="text-[var(--accent)]" />
               <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--accent)]">Intelligence Sovereignty Protocol v2.0</span>
            </div>
            
            <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-[0.9] italic uppercase">
              Architect Your <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent)] via-purple-400 to-cyan-400">
                Neural Manifest.
              </span>
            </h1>
            
            <p className="text-xl text-[var(--text-secondary)] leading-relaxed max-w-xl">
              The sovereign system that transcribes your existence, extracts your intelligence, and trains your digital twin. From raw signal to permanent structure.
            </p>

            <div className="flex flex-wrap gap-4 pt-4">
              <Link href="/dashboard" className="px-8 py-4 rounded-2xl bg-[var(--accent)] text-white font-bold text-lg hover:scale-[1.02] active:scale-95 transition-all shadow-[0_0_40px_-10px_rgba(124,106,245,0.6)] flex items-center gap-3">
                Start Logging <ChevronRight size={20} />
              </Link>
              <div className="px-8 py-4 rounded-2xl bg-white/5 border border-white/10 text-white font-bold text-lg backdrop-blur-md flex items-center gap-3">
                <Box size={20} className="text-cyan-400" /> BYOK Enabled
              </div>
            </div>

            <div className="flex items-center gap-8 pt-8 border-t border-white/5">
               <div className="space-y-1">
                 <p className="text-2xl font-black italic">100%</p>
                 <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]">Data Sovereignty</p>
               </div>
               <div className="space-y-1">
                 <p className="text-2xl font-black italic text-cyan-400">0ms</p>
                 <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]">Signal Latency</p>
               </div>
               <div className="space-y-1">
                 <p className="text-2xl font-black italic text-purple-400">BYOK</p>
                 <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]">Bring Your Own Key</p>
               </div>
            </div>
          </div>

          {/* Visual: The Manifest Preview */}
          <div className="relative aspect-square">
             <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--accent)_0%,_transparent_70%)] opacity-20 blur-3xl" />
             <div className="relative h-full w-full rounded-[4rem] border border-white/10 bg-black/40 backdrop-blur-3xl overflow-hidden shadow-2xl group">
                <img 
                  src="/neural_manifest_hyper_realistic_avatar_1773404786973.png" 
                  alt="Neural Manifest"
                  className="w-full h-full object-cover grayscale brightness-110 opacity-60 group-hover:opacity-100 transition-opacity duration-1000"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                
                {/* HUD Telemetry Overlays */}
                <div className="absolute top-10 left-10 space-y-2">
                   <div className="flex items-center gap-2 px-3 py-1 bg-black/60 border border-white/10 rounded-lg backdrop-blur-md">
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                      <span className="text-[10px] font-mono uppercase tracking-widest">Signal Syncing...</span>
                   </div>
                </div>

                <div className="absolute bottom-10 left-10 right-10 p-6 bg-black/60 border border-white/10 rounded-[2rem] backdrop-blur-md">
                   <div className="flex justify-between items-center mb-4">
                      <span className="text-xs font-mono font-bold uppercase tracking-widest text-[var(--accent)]">Manifest LVL 14</span>
                      <span className="text-[10px] font-mono text-white/40">INTELLIGENCE QUOTIENT: NOMINAL</span>
                   </div>
                   <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[var(--accent)] to-cyan-400" style={{ width: '75%' }} />
                   </div>
                </div>

                {/* Scanning line animation */}
                <div className="absolute top-0 left-0 w-full h-1 bg-[var(--accent)]/50 shadow-[0_0_20px_var(--accent)] animate-[scan_8s_linear_infinite]" />
             </div>
          </div>
        </div>
      </section>

      {/* Sovereignty Pillars */}
      <section className="relative z-10 py-32 border-t border-white/5 bg-black/20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-20 space-y-4">
             <h2 className="text-xs font-mono font-black uppercase tracking-[0.5em] text-[var(--accent)]">Sovereignty Pillar</h2>
             <h3 className="text-5xl font-black italic uppercase leading-none">Your Thinking. <br /> Your Infrastructure.</h3>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { 
                icon: <Unlock size={32} className="text-[var(--accent)]" />, 
                title: 'BYOK Architecture', 
                desc: 'Bring your own OpenAI, Anthropic, or Groq keys. No middleman markup. Total sovereign control over your intelligence costs and model choices.' 
              },
              { 
                icon: <Database size={32} className="text-cyan-400" />, 
                title: 'Sovereign Storage', 
                desc: 'Direct R2/S3 integration. Your files never touch our servers. Your bucket, your data, permanent and portable by default.' 
              },
              { 
                icon: <Share2 size={32} className="text-purple-400" />, 
                title: 'Open Manifolds', 
                desc: 'Your knowledge graph belongs to you. Export your entire neural vault in JSON or Markdown anytime. No vendor lock-in, ever.' 
              },
            ].map(pillar => (
              <div key={pillar.title} className="p-10 rounded-[2.5rem] bg-white/[0.02] border border-white/5 hover:border-[var(--accent)]/30 transition-all group">
                <div className="mb-8 p-4 rounded-2xl bg-white/[0.03] inline-block group-hover:scale-110 transition-transform">
                  {pillar.icon}
                </div>
                <h4 className="text-2xl font-bold mb-4 italic uppercase">{pillar.title}</h4>
                <p className="text-[var(--text-secondary)] leading-relaxed">
                  {pillar.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integrated RPG Layer */}
      <section className="relative z-10 py-32">
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-20 items-center">
          <div className="space-y-12">
            <div className="space-y-4">
              <h2 className="text-xs font-mono font-black uppercase tracking-[0.5em] text-cyan-400">System Mechanics</h2>
              <h3 className="text-6xl font-black italic uppercase leading-none">The Progressive <br /> Intelligence Loop.</h3>
            </div>

            <div className="space-y-8">
              {[
                { num: '01', title: 'Multimodal Ingestion', desc: 'Drop raw video, audio, or text. Neolog extracts ideas, projects, and commitments across every session automatically.' },
                { num: '02', title: 'Momentum & XP', desc: 'Every signal stabilized gains you XP. Watch your skills unlock as your knowledge graph matures.' },
                { num: '03', title: 'Automated Synthesis', desc: 'The system narrates your progress, updating your character profile, socials, and portfolio in real-time.' },
              ].map(step => (
                <div key={step.num} className="flex gap-6 group">
                  <span className="text-2xl font-black italic text-white/20 group-hover:text-cyan-400 transition-colors">{step.num}</span>
                  <div className="space-y-2">
                    <h4 className="text-xl font-bold uppercase italic">{step.title}</h4>
                    <p className="text-[var(--text-secondary)] leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="p-8 rounded-[2rem] bg-gradient-to-br from-white/[0.05] to-transparent border border-white/10 space-y-6">
               <Brain size={48} className="text-purple-400" />
               <h5 className="font-black italic uppercase">Cognitive Graph</h5>
               <div className="space-y-2">
                  <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-400" style={{ width: '88%' }} />
                  </div>
                  <p className="text-[9px] font-mono text-white/40 uppercase tracking-widest">Stability: Optimal</p>
               </div>
            </div>
            <div className="p-8 rounded-[2rem] bg-gradient-to-br from-white/[0.05] to-transparent border border-white/10 mt-12 space-y-6 text-right">
               <div className="flex justify-end"><Target size={48} className="text-amber-400 " /></div>
               <h5 className="font-black italic uppercase">Active Directives</h5>
               <div className="space-y-2">
                  <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 ml-auto" style={{ width: '62%' }} />
                  </div>
                  <p className="text-[9px] font-mono text-white/40 uppercase tracking-widest">Momentum: High</p>
               </div>
            </div>
            <div className="p-8 rounded-[2rem] bg-gradient-to-br from-white/[0.05] to-transparent border border-white/10 space-y-6">
               <Fingerprint size={48} className="text-[var(--accent)]" />
               <h5 className="font-black italic uppercase">Manifest Sync</h5>
               <div className="space-y-2">
                  <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--accent)]" style={{ width: '99%' }} />
                  </div>
                  <p className="text-[9px] font-mono text-white/40 uppercase tracking-widest">Profile: Sovereign</p>
               </div>
            </div>
            <div className="p-8 rounded-[2rem] bg-gradient-to-br from-white/[0.05] to-transparent border border-white/10 mt-12 space-y-6 text-right">
               <div className="flex justify-end"><Flame size={48} className="text-rose-500" /></div>
               <h5 className="font-black italic uppercase">Metabolic Surge</h5>
               <div className="space-y-2">
                  <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-rose-500 ml-auto" style={{ width: '45%' }} />
                  </div>
                  <p className="text-[9px] font-mono text-white/40 uppercase tracking-widest">Focus: Critical</p>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative z-10 py-48 text-center px-6">
        <div className="max-w-3xl mx-auto space-y-10">
          <h2 className="text-4xl md:text-7xl font-black italic uppercase leading-none">
            Stop losing your <br /> best thinking.
          </h2>
          <p className="text-xl text-[var(--text-secondary)] leading-relaxed">
            Every recording, note, and spark — captured, stabilized, and evolved into a permanent manifest of your existence.
          </p>
          <div className="flex justify-center gap-6">
            <Link href="/dashboard" className="px-12 py-5 rounded-2xl bg-white text-black font-black text-xl hover:scale-[1.05] active:scale-95 transition-all shadow-2xl">
              Initialize neolog v1.0
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-12 border-t border-white/5 bg-black/40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3 grayscale opacity-50">
             <div className="w-6 h-6 rounded bg-white text-black flex items-center justify-center text-[10px] font-black">N</div>
             <span className="font-bold tracking-tighter text-sm">NEOLOG © 2026</span>
          </div>
          <div className="flex gap-12 font-mono text-[10px] uppercase tracking-widest text-white/30">
            <Link href="#" className="hover:text-[var(--accent)] transition-colors">Neural Sovereignty Pact</Link>
            <Link href="#" className="hover:text-[var(--accent)] transition-colors">Terms of Manifold</Link>
            <Link href="#" className="hover:text-[var(--accent)] transition-colors">BYOK Documentation</Link>
          </div>
        </div>
      </footer>

      <style jsx global>{`
        @keyframes scan {
          from { transform: translateY(-100%); }
          to { transform: translateY(800px); }
        }
      `}</style>
    </div>
  )
}
