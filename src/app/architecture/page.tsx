
import fs from 'fs/promises'
import path from 'path'

export const dynamic = 'force-static'

export default async function ArchitecturePage() {
  const basePath = process.cwd()
  const [architecture, appendix] = await Promise.all([
    fs.readFile(path.join(basePath, 'MASTER_ARCHITECTURE.md'), 'utf8'),
    fs.readFile(path.join(basePath, 'ARCHITECTURE_APPENDIX.md'), 'utf8'),
  ])

  return (
    <main className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="max-w-5xl mx-auto px-6 py-16 space-y-8">
        <header>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
            Architecture
          </p>
          <h1 className="font-display text-3xl">Neolog Architecture</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-2">
            Master technical definition + visual appendix.
          </p>
        </header>

        <pre className="whitespace-pre-wrap rounded-2xl border border-[var(--border-light)] bg-[var(--bg-secondary)] p-6 text-sm leading-6">
          {architecture}
        </pre>

        <pre className="whitespace-pre-wrap rounded-2xl border border-[var(--border-light)] bg-[var(--bg-secondary)] p-6 text-sm leading-6">
          {appendix}
        </pre>
      </div>
    </main>
  )
}
