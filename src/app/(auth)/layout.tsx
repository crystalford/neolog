import Link from 'next/link'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] p-6 relative overflow-hidden">
      
      {/* Ambient blooms */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: '-20%',
          right: '-10%',
          width: '60vw',
          height: '60vh',
          background: 'radial-gradient(ellipse, rgba(124,106,245,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <div className="w-full max-w-sm relative z-10 flex flex-col items-center">
        <Link href="/" className="flex items-center gap-2 mb-10 hover:opacity-80 transition-opacity">
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '28px', height: '28px', borderRadius: '5px',
            background: 'var(--text-primary)', color: 'var(--text-inverse)',
            fontWeight: 700, fontSize: '14px', letterSpacing: '-0.02em',
          }}>N</span>
          <span className="font-sans text-xl font-semibold tracking-tight text-[var(--text-primary)]">Neolog</span>
        </Link>
        
        <div className="w-full">
          {children}
        </div>
      </div>
    </div>
  )
}

