import fs from 'fs/promises'
import path from 'path'

export const dynamic = 'force-static'

export default async function RoadmapPage() {
  const roadmapPath = path.join(process.cwd(), 'ROADMAP.md')
  const architecturePath = path.join(process.cwd(), 'MASTER_ARCHITECTURE.md')
  const [roadmap, architecture] = await Promise.all([
    fs.readFile(roadmapPath, 'utf8'),
    fs.readFile(architecturePath, 'utf8'),
  ])

  return (
    <main className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="font-display text-3xl mb-6">Master Roadmap</h1>
        <div className="space-y-8">
          <pre className="whitespace-pre-wrap rounded-2xl border border-[var(--border-light)] bg-[var(--bg-secondary)] p-6 text-sm leading-6">
            {architecture}
          </pre>
          <pre className="whitespace-pre-wrap rounded-2xl border border-[var(--border-light)] bg-[var(--bg-secondary)] p-6 text-sm leading-6">
            {roadmap}
          </pre>
        </div>
      </div>
    </main>
  )
}
