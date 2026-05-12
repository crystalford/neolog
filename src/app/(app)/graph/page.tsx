/**
 * Graph — direct view of the substrate. Entities, threads, clusters,
 * connections. The territory. Stub until graph rendering ships.
 */
export const runtime = 'edge'

export default function GraphPage() {
  return (
    <main>
      <section className="hero">
        <div className="crumb reveal d2">The territory</div>
        <h1 className="reveal d3">Graph</h1>
        <p className="lead reveal d4">A direct, navigable view of the underlying graph — people, places, projects, tools, concepts, and the threads that bind them.</p>
      </section>
      <div className="stub-empty reveal d5">
        <div className="label">Coming next</div>
        <p>Once the extraction pipeline has populated entities and connections, this surface will render them as a navigable node-edge graph colored by topic territory.</p>
      </div>
    </main>
  )
}
