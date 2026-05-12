/**
 * Studio — cluster cultivation, deliberate work. Reached from Surfaced cards.
 * Stub for now; full surface ships once clusters + production_v1 are live.
 */
export const runtime = 'edge'

export default function StudioPage() {
  return (
    <main>
      <section className="hero">
        <div className="crumb reveal d2">Deliberate work</div>
        <h1 className="reveal d3">Studio</h1>
        <p className="lead reveal d4">When a cluster ripens, you come here to materialize. A cluster detail = a focused workspace: all threads inside, adjacent insights, gap questions, and the production engine to ship something out of it.</p>
      </section>
      <div className="stub-empty reveal d5">
        <div className="label">Nothing ripe yet</div>
        <p>Clusters form once you've got several vlogs circling the same underlying thing. Drop in a few captures and the system will start surfacing what's ready to materialize.</p>
      </div>
    </main>
  )
}
