import Link from 'next/link'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex">
      {/* Left side - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-[var(--bg-inverse)] text-[var(--text-inverse)] p-12 flex-col justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="w-9 h-9 bg-white rounded-lg flex items-center justify-center font-mono text-sm font-semibold text-[var(--bg-inverse)]">
            N
          </span>
          <span className="font-display text-2xl">Neolog</span>
        </Link>
        
        <div>
          <blockquote className="font-display text-3xl leading-relaxed mb-6">
            "Finally, a publishing platform that doesn't mangle my code."
          </blockquote>
          <p className="text-white/60"> -  Every developer who's tried to publish HTML on Medium</p>
        </div>
        
        <p className="text-sm text-white/40">
          (c) 2025 Neolog. Write without compromise.
        </p>
      </div>
      
      {/* Right side - form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12">
        <div className="lg:hidden mb-12">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="w-9 h-9 bg-[var(--accent)] rounded-lg flex items-center justify-center font-mono text-sm font-semibold text-white">
              N
            </span>
            <span className="font-display text-2xl">Neolog</span>
          </Link>
        </div>
        
        <div className="w-full max-w-sm">
          {children}
        </div>
      </div>
    </div>
  )
}

