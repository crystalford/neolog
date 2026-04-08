
import fs from 'fs/promises'
import path from 'path'

export const dynamic = 'force-static'

export default async function ReadmePage() {
  const filePath = path.join(process.cwd(), 'README.md')
  const content = await fs.readFile(filePath, 'utf8')

  return (
    <main className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="font-display text-3xl mb-6">README</h1>
        <pre className="whitespace-pre-wrap rounded-2xl border border-[var(--border-light)] bg-[var(--bg-secondary)] p-6 text-sm leading-6">
          {content}
        </pre>
      </div>
    </main>
  )
}
