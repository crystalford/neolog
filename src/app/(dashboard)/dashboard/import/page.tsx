export const runtime = 'edge'
import Link from 'next/link'

export default function ImportPage() {
  return (
    <main className="px-8 py-10 max-w-4xl mx-auto animate-fade-up bg-gradient-to-b from-[var(--bg-primary)] to-[var(--bg-secondary)] min-h-screen">
      <header className="mb-10">
        <h1 className="font-display text-3xl font-bold text-[var(--text-primary)]">Import Content</h1>
        <p className="text-base text-[var(--text-secondary)] mt-2 max-w-2xl">
          Bring existing work into Neolog. Import tooling is in progress, but you can already capture, draft, and publish new writing while we finish the pipeline.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-3xl border border-[var(--border-light)] bg-white/80 backdrop-blur p-6 shadow-lg">
          <p className="text-xs uppercase tracking-[0.15em] text-[var(--text-tertiary)] mb-3">
            Planned formats
          </p>
          <h2 className="font-display text-xl font-semibold text-[var(--text-primary)] mb-3">
            Import from the places you already write
          </h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {['Markdown', 'HTML', 'JSON', 'RSS/Atom', 'WordPress'].map((format) => (
              <span
                key={format}
                className="px-3 py-1 rounded-full text-xs font-medium bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-light)]"
              >
                {format}
              </span>
            ))}
          </div>
          <ol className="space-y-2 text-sm text-[var(--text-secondary)]">
            <li>1. Export your existing posts from your platform.</li>
            <li>2. Upload the file and map fields to Neolog.</li>
            <li>3. Review, then publish or keep drafts private.</li>
          </ol>
        </section>

        <section className="rounded-3xl border border-[var(--border-light)] bg-white/90 backdrop-blur p-6 shadow-lg">
          <p className="text-xs uppercase tracking-[0.15em] text-[var(--text-tertiary)] mb-3">
            What you can do now
          </p>
          <h2 className="font-display text-xl font-semibold text-[var(--text-primary)] mb-3">
            Start creating immediately
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-6">
            Capture ideas, draft posts, and build momentum. Your new work will be ready as soon as import lands.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/dashboard/captures" className="btn btn-secondary text-sm px-4 py-2.5 font-medium">
              Add Capture
            </Link>
            <Link href="/write" className="btn btn-primary text-sm px-4 py-2.5 font-semibold">
              Start Draft
            </Link>
            <Link href="/roadmap" className="btn btn-secondary text-sm px-4 py-2.5 font-medium">
              View Roadmap
            </Link>
          </div>
        </section>
      </div>

      <section className="mt-8 rounded-3xl border border-dashed border-[var(--border-light)] bg-white/70 p-6 text-center shadow">
        <p className="text-sm text-[var(--text-secondary)]">
          Want early access to import? We can prioritize formats based on demand.
        </p>
        <p className="text-xs text-[var(--text-tertiary)] mt-2">
          Share what you want to bring over and we will keep you posted.
        </p>
      </section>
    </main>
  )
}
