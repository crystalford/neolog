/**
 * Attachment detail — text, PDF, image attached to a thread or project.
 * Auto-extracted text via the extract-attachment-text Workflow (staged).
 */
export const runtime = 'edge'

export default function AttachmentDetailPage({ params }: { params: { id: string } }) {
  return (
    <main>
      <a href="/timeline" className="detail-back">← Timeline</a>
      <div className="detail-stage">
        <section style={{ paddingTop: 24 }}>
          <div className="kicker">Attachment · {params.id.slice(0, 8)}</div>
          <h1 style={{ fontWeight: 500, fontSize: 26, letterSpacing: '-0.5px', margin: '8px 0 16px' }}>Reference material</h1>
        </section>

        <div className="section">
          <div className="section-label">Extracted text</div>
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 12, padding: 16, color: 'var(--fg-3)', fontSize: 13, fontStyle: 'italic' }}>
            extract-attachment-text Workflow pending.
          </div>
        </div>

        <div className="section">
          <div className="section-label">Linked threads</div>
          <p style={{ color: 'var(--fg-3)', fontSize: 13 }}>None yet.</p>
        </div>
      </div>
    </main>
  )
}
