/**
 * Projects — long-form creative work containers. Pack Rats, Mechanical Bride,
 * characters in development. Different rhythm from the rest. Stub until
 * projects v2 schema + UI ship.
 */
export const runtime = 'edge'

export default function ProjectsPage() {
  return (
    <main>
      <section className="hero">
        <div className="crumb reveal d2">Creative work</div>
        <h1 className="reveal d3">Projects</h1>
        <p className="lead reveal d4">Long-form creative containers — Pack Rats, characters in development, the work that doesn't fit the daily feed.</p>
      </section>
      <div className="stub-empty reveal d5">
        <div className="label">No projects yet</div>
        <p>You'll be able to spin up a project, attach threads to it from Timeline, and watch characters or beats accumulate inside.</p>
      </div>
    </main>
  )
}
