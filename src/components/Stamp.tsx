'use client'

/**
 * The last-changed stamp every page in the machine layer carries.
 *
 * `SPEC.md` §3: "Every page carries a *last changed* stamp." The value is
 * the newest row the page draws from — not the time the request was served.
 * A page that says it changed just now every time it is loaded is saying
 * nothing, so a page with nothing behind it says that instead.
 *
 * It also carries the line the design calls the owner strip's job on an
 * unlisted page: saying out loud that this address is not in the menu, so
 * arriving here by a link never reads as arriving somewhere broken.
 */

export default function Stamp({ at, unlisted, note }: {
  at: string | null
  unlisted?: boolean
  note?: string
}) {
  const d = at ? new Date(at) : null
  const good = d && !isNaN(d.getTime())
  return (
    <div className="stamp">
      <span>
        {good ? 'last changed' : 'nothing on it yet'}
      </span>
      {good && (
        <time dateTime={d!.toISOString()}>
          {d!.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </time>
      )}
      <span>every entry carries its own date</span>
      {unlisted && <span className="unlisted">not in the menu</span>}
      {note && <span>{note}</span>}
    </div>
  )
}
