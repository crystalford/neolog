'use client'

import { useEffect, useRef, useState } from 'react'
import { Network, Search, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'

type Node = {
  id: string
  name: string
  type: string
  mention_count: number
}

type Link = {
  source: string
  target: string
  value: number
}

type GraphData = {
  nodes: Node[]
  links: Link[]
}

export function NetworkGraph() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [data, setData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 })

  useEffect(() => {
    async function fetchGraph() {
      try {
        const res = await fetch('/api/entities/graph')
        if (res.ok) {
          const json = await res.json()
          setData(json)
        }
      } catch (err) {
        console.error('Failed to fetch graph data:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchGraph()
  }, [])

  // Simple Force Simulation (Physics engine)
  const [positions, setPositions] = useState<Record<string, { x: number, y: number }>>({})

  useEffect(() => {
    if (!data || data.nodes.length === 0) return

    // Initial positions
    const initialPos: Record<string, { x: number, y: number }> = {}
    const width = 800
    const height = 600
    data.nodes.forEach((node, i) => {
      initialPos[node.id] = {
        x: width / 2 + (Math.random() - 0.5) * 400,
        y: height / 2 + (Math.random() - 0.5) * 400
      }
    })
    setPositions(initialPos)

    // Basic simulation loop
    let animationId: number
    const nodes = data.nodes.map(n => ({ ...n, x: initialPos[n.id].x, y: initialPos[n.id].y, vx: 0, vy: 0 }))
    const links = data.links.map(l => ({ ...l }))

    const tick = () => {
      const alpha = 0.05
      
      // Forces
      // 1. Center force
      nodes.forEach(n => {
        n.vx += (width / 2 - n.x) * 0.01 * alpha
        n.vy += (height / 2 - n.y) * 0.01 * alpha
      })

      // 2. Repulsion (Many-body force)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const nodeA = nodes[i]
          const nodeB = nodes[j]
          const dx = nodeB.x - nodeA.x
          const dy = nodeB.y - nodeA.y
          const distanceSq = dx * dx + dy * dy || 1
          const force = 2000 / distanceSq
          const fx = (dx / Math.sqrt(distanceSq)) * force * alpha
          const fy = (dy / Math.sqrt(distanceSq)) * force * alpha
          nodeA.vx -= fx
          nodeA.vy -= fy
          nodeB.vx += fx
          nodeB.vy += fy
        }
      }

      // 3. Link force (Springs)
      links.forEach(link => {
        const source = nodes.find(n => n.id === link.source)
        const target = nodes.find(n => n.id === link.target)
        if (!source || !target) return
        const dx = target.x - source.x
        const dy = target.y - source.y
        const distance = Math.sqrt(dx * dx + dy * dy) || 1
        const strength = 0.1 * link.value
        const targetDist = 150
        const force = (distance - targetDist) * strength * alpha
        const fx = (dx / distance) * force
        const fy = (dy / distance) * force
        source.vx += fx
        source.vy += fy
        target.vx -= fx
        target.vy -= fy
      })

      // Apply movement
      const newPos: Record<string, { x: number, y: number }> = {}
      nodes.forEach(n => {
        n.x += n.vx
        n.y += n.vy
        n.vx *= 0.9 // friction
        n.vy *= 0.9
        newPos[n.id] = { x: n.x, y: n.y }
      })

      setPositions(newPos)
      animationId = requestAnimationFrame(tick)
    }

    animationId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationId)
  }, [data])

  if (loading) return (
    <div className="h-[500px] flex flex-col items-center justify-center gap-4 border border-[var(--border-light)] rounded-3xl bg-[var(--bg-secondary)]/30">
      <Network size={32} className="animate-pulse text-[var(--accent)]" />
      <span className="text-[10px] uppercase font-mono tracking-widest text-[var(--text-tertiary)]">Booting neural engine...</span>
    </div>
  )

  if (!data || data.nodes.length === 0) return null

  const nodeColor = (type: string) => {
    switch (type) {
      case 'project': return '#60a5fa'
      case 'idea': return '#fbbf24'
      case 'person': return '#4ade80'
      case 'goal': return '#a78bfa'
      default: return '#94a3b8'
    }
  }

  return (
    <div className="relative h-[600px] w-full border border-[var(--border-light)] rounded-[2.5rem] bg-[var(--bg-secondary)]/20 overflow-hidden group">
      {/* Controls Overlay */}
      <div className="absolute top-6 left-6 z-10 flex flex-col gap-2">
         <div className="p-1 rounded-xl bg-[var(--bg-card)]/80 backdrop-blur-md border border-[var(--border-light)] shadow-xl flex flex-col gap-1">
            <button className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-all">
              <ZoomIn size={16} />
            </button>
            <button className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-all">
              <ZoomOut size={16} />
            </button>
            <div className="h-px bg-[var(--border-light)] mx-1" />
            <button className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-all">
              <Maximize2 size={16} />
            </button>
         </div>
         <div className="px-3 py-1.5 rounded-lg bg-[var(--bg-card)]/80 backdrop-blur-md border border-[var(--border-light)] text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-widest shadow-xl">
           {data.nodes.length} Nodes · {data.links.length} Links
         </div>
      </div>

      <svg 
        viewBox="0 0 800 600" 
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={() => {}} // TODO: Add drag support
      >
        <defs>
          <radialGradient id="nodeGradient">
            <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.4" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Links */}
        {data.links.map((link, i) => {
          const s = positions[link.source]
          const t = positions[link.target]
          if (!s || !t) return null
          
          const isHighlighted = hoveredNode === link.source || hoveredNode === link.target

          return (
            <line
              key={`${link.source}-${link.target}`}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              stroke="white"
              strokeWidth={Math.min(3, 0.5 + link.value * 0.5)}
              strokeOpacity={isHighlighted ? 0.4 : 0.05}
              className="transition-opacity duration-300"
            />
          )
        })}

        {/* Nodes */}
        {data.nodes.map((node) => {
          const pos = positions[node.id]
          if (!pos) return null

          const isHovered = hoveredNode === node.id
          const radius = Math.sqrt(node.mention_count) * 2 + 4
          const color = nodeColor(node.type)

          return (
            <g 
              key={node.id} 
              transform={`translate(${pos.x}, ${pos.y})`}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
              className="cursor-pointer"
            >
              <circle
                r={radius + (isHovered ? 4 : 0)}
                fill={color}
                className="transition-all duration-300"
                style={{ 
                  filter: isHovered ? 'url(#glow)' : 'none',
                  opacity: hoveredNode && !isHovered ? 0.4 : 1
                }}
              />
              {isHovered && (
                <g>
                   <rect
                     x={radius + 8}
                     y={-12}
                     width={node.name.length * 7 + 16}
                     height={24}
                     rx={6}
                     fill="var(--bg-card)"
                     className="shadow-2xl"
                     stroke={color}
                     strokeWidth={1}
                     style={{ opacity: 0.9 }}
                   />
                   <text
                     x={radius + 16}
                     y={4}
                     fill="white"
                     className="text-[11px] font-bold pointer-events-none"
                   >
                     {node.name}
                   </text>
                </g>
              )}
            </g>
          )
        })}
      </svg>
      
      {/* Legend */}
      <div className="absolute bottom-6 right-6 flex gap-4 text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-tighter bg-[var(--bg-card)]/80 backdrop-blur-md px-4 py-2 rounded-xl border border-[var(--border-light)] shadow-xl opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-[#60a5fa]" /> Project</div>
        <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-[#fbbf24]" /> Idea</div>
        <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" /> Person</div>
        <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-[#a78bfa]" /> Goal</div>
      </div>
    </div>
  )
}
