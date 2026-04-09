'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Network, Search, ZoomIn, ZoomOut, Maximize2, MousePointer2 } from 'lucide-react'

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

export default function NetworkGraph() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [data, setData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [draggedNode, setDraggedNode] = useState<string | null>(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 })
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef({ x: 0, y: 0 })

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
  const simulationRef = useRef<{ nodes: any[], links: any[] } | null>(null)

  useEffect(() => {
    if (!data || data.nodes.length === 0) return

    const width = 800
    const height = 600

    // Initialize or keep existing positions
    const nodes = data.nodes.map(n => {
      const existing = positions[n.id]
      return {
        ...n,
        x: existing?.x ?? (width / 2 + (Math.random() - 0.5) * 400),
        y: existing?.y ?? (height / 2 + (Math.random() - 0.5) * 400),
        vx: 0,
        vy: 0
      }
    })
    const links = data.links.map(l => ({ ...l }))
    simulationRef.current = { nodes, links }

    let animationId: number
    const tick = () => {
      if (!simulationRef.current) return
      const { nodes, links } = simulationRef.current
      const alpha = 0.05
      
      // Forces
      // 1. Center force
      nodes.forEach(n => {
        if (n.id === draggedNode) return
        n.vx += (width / 2 - n.x) * 0.005 * alpha
        n.vy += (height / 2 - n.y) * 0.005 * alpha
      })

      // 2. Repulsion (Many-body force)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const nodeA = nodes[i]
          const nodeB = nodes[j]
          const dx = nodeB.x - nodeA.x
          const dy = nodeB.y - nodeA.y
          const distanceSq = dx * dx + dy * dy || 1
          const force = 3000 / distanceSq
          const fx = (dx / Math.sqrt(distanceSq)) * force * alpha
          const fy = (dy / Math.sqrt(distanceSq)) * force * alpha
          
          if (nodeA.id !== draggedNode) {
            nodeA.vx -= fx
            nodeA.vy -= fy
          }
          if (nodeB.id !== draggedNode) {
            nodeB.vx += fx
            nodeB.vy += fy
          }
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
        const strength = 0.05 * link.value
        const targetDist = 120
        const force = (distance - targetDist) * strength * alpha
        const fx = (dx / distance) * force
        const fy = (dy / distance) * force
        
        if (source.id !== draggedNode) {
          source.vx += fx
          source.vy += fy
        }
        if (target.id !== draggedNode) {
          target.vx -= fx
          target.vy -= fy
        }
      })

      // Apply movement
      const newPos: Record<string, { x: number, y: number }> = {}
      nodes.forEach(n => {
        if (n.id !== draggedNode) {
          n.x += n.vx
          n.y += n.vy
          n.vx *= 0.9 // friction
          n.vy *= 0.9
        }
        newPos[n.id] = { x: n.x, y: n.y }
      })

      setPositions(newPos)
      animationId = requestAnimationFrame(tick)
    }

    animationId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationId)
  }, [data, draggedNode])

  // Mouse Handlers for Pan & Drag
  const handleMouseDown = (e: React.MouseEvent) => {
    if (hoveredNode) {
      setDraggedNode(hoveredNode)
    } else {
      setIsPanning(true)
      panStart.current = { x: e.clientX - transform.x, y: e.clientY - transform.y }
    }
  }

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (draggedNode && simulationRef.current) {
      const { nodes } = simulationRef.current
      const node = nodes.find(n => n.id === draggedNode)
      if (node && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        // Convert mouse coordinates to SVG coordinates
        const x = (e.clientX - rect.left - transform.x) / transform.k
        const y = (e.clientY - rect.top - transform.y) / transform.k
        node.x = x
        node.y = y
      }
    } else if (isPanning) {
      setTransform(prev => ({
        ...prev,
        x: e.clientX - panStart.current.x,
        y: e.clientY - panStart.current.y
      }))
    }
  }, [draggedNode, isPanning, transform])

  const handleMouseUp = () => {
    setDraggedNode(null)
    setIsPanning(false)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    if (!containerRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const zoomSpeed = 0.0015
    const delta = -e.deltaY * zoomSpeed
    const nextK = Math.min(4, Math.max(0.1, transform.k * (1 + delta)))

    // Coordinate-aware zoom: adjust x and y so the mouse stays over the same point
    const factor = nextK / transform.k
    const nextX = mouseX - (mouseX - transform.x) * factor
    const nextY = mouseY - (mouseY - transform.y) * factor

    setTransform({ x: nextX, y: nextY, k: nextK })
  }

  const zoomIn = () => setTransform(prev => ({ ...prev, k: Math.min(3, prev.k + 0.2) }))
  const zoomOut = () => setTransform(prev => ({ ...prev, k: Math.max(0.2, prev.k - 0.2) }))
  const resetZoom = () => setTransform({ x: 0, y: 0, k: 1 })

  if (loading) return (
    <div className="h-[500px] flex flex-col items-center justify-center gap-4 border border-[var(--border-light)] rounded-3xl bg-[var(--bg-secondary)]/30">
      <Network size={32} className="animate-pulse text-[var(--accent)]" />
      <span className="text-[10px] uppercase font-mono tracking-widest text-[var(--text-tertiary)]">Booting neural engine...</span>
    </div>
  )

  if (!data || data.nodes.length === 0) return null

  // Density Filter: only show high-mention nodes unless zoomed in
  // or if there are few nodes total.
  const isZoomedIn = transform.k > 1.5
  const filteredNodes = data.nodes.filter(n => 
    isZoomedIn || 
    n.mention_count > 1 || 
    data.nodes.length < 15
  )
  const filteredLinks = data.links.filter(l => 
    filteredNodes.some(n => n.id === l.source) && 
    filteredNodes.some(n => n.id === l.target)
  )

  const nodeColor = (type: string) => {
    switch (type) {
      case 'project': return '#60a5fa'
      case 'idea': return '#fbbf24'
      case 'person': return '#4ade80'
      case 'goal': return '#a78bfa'
      default: return '#94a3b8'
    }
  }

  // Get neighbor IDs for highlighting
  const neighbors = new Set<string>()
  if (hoveredNode) {
    data.links.forEach(link => {
      if (link.source === hoveredNode) neighbors.add(link.target)
      if (link.target === hoveredNode) neighbors.add(link.source)
    })
  }

  return (
    <div 
      ref={containerRef}
      className="relative h-[600px] w-full border border-[var(--border-light)] rounded-[2.5rem] bg-[var(--bg-secondary)]/20 overflow-hidden group select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* Controls Overlay */}
      <div className="absolute top-6 left-6 z-10 flex flex-col gap-2">
         <div className="p-1 rounded-xl bg-[var(--bg-card)]/80 backdrop-blur-md border border-[var(--border-light)] shadow-xl flex flex-col gap-1">
            <button 
              onClick={zoomIn}
              className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-all"
            >
              <ZoomIn size={16} />
            </button>
            <button 
              onClick={zoomOut}
              className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-all"
            >
              <ZoomOut size={16} />
            </button>
            <div className="h-px bg-[var(--border-light)] mx-1" />
            <button 
              onClick={resetZoom}
              className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-all"
            >
              <Maximize2 size={16} />
            </button>
         </div>
          <div className="px-3 py-1.5 rounded-lg bg-[var(--bg-card)]/80 backdrop-blur-md border border-[var(--border-light)] text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-widest shadow-xl flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {filteredNodes.length} Nodes · {filteredLinks.length} Links
            {!isZoomedIn && data.nodes.length > filteredNodes.length && (
              <span className="text-[var(--accent)] ml-1 opacity-60">(+{data.nodes.length - filteredNodes.length} hidden)</span>
            )}
          </div>
      </div>

      <svg 
        viewBox="0 0 800 600" 
        className={`w-full h-full ${draggedNode ? 'cursor-grabbing' : hoveredNode ? 'cursor-grab' : 'cursor-default'}`}
        onMouseDown={handleMouseDown}
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

        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
          {/* Links */}
          {filteredLinks.map((link, i) => {
            const s = positions[link.source]
            const t = positions[link.target]
            if (!s || !t) return null
            
            const isHighlighted = hoveredNode === link.source || hoveredNode === link.target
            const isDimmed = hoveredNode && !isHighlighted

            return (
              <line
                key={`${link.source}-${link.target}`}
                x1={s.x}
                y1={s.y}
                x2={t.x}
                y2={t.y}
                stroke="white"
                strokeWidth={isHighlighted ? 2 : Math.min(2, 0.5 + link.value * 0.3)}
                strokeOpacity={isHighlighted ? 0.6 : isDimmed ? 0.02 : 0.08}
                className="transition-all duration-300"
              />
            )
          })}

          {/* Nodes */}
          {filteredNodes.map((node) => {
            const pos = positions[node.id]
            if (!pos) return null

            const isHovered = hoveredNode === node.id
            const isNeighbor = neighbors.has(node.id)
            const isDimmed = hoveredNode && !isHovered && !isNeighbor
            
            const radius = Math.sqrt(node.mention_count) * 2 + 5
            const color = nodeColor(node.type)

            return (
              <g 
                key={node.id} 
                transform={`translate(${pos.x}, ${pos.y})`}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                className="cursor-pointer"
              >
                {/* Visual pulse for neighbors */}
                {isNeighbor && (
                   <circle
                    r={radius + 4}
                    fill="none"
                    stroke={color}
                    strokeWidth={1}
                    className="animate-ping opacity-20"
                   />
                )}
                
                <circle
                  r={radius + (isHovered ? 4 : 0)}
                  fill={color}
                  className="transition-all duration-300"
                  style={{ 
                    filter: isHovered ? 'url(#glow)' : 'none',
                    opacity: isDimmed ? 0.2 : 1,
                    stroke: isHovered ? 'white' : 'none',
                    strokeWidth: 2
                  }}
                />
                
                {/* Labels for highlights */}
                {(isHovered || isNeighbor || transform.k > 1.2) && (
                   <text
                     y={radius + 14}
                     textAnchor="middle"
                     fill="white"
                     className="text-[9px] font-mono pointer-events-none fill-white/60"
                     style={{ opacity: isDimmed ? 0.1 : 1 }}
                   >
                     {node.name}
                   </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>
      
      {/* Active Node Info Drawer (Simplified) */}
      {hoveredNode && (
        <div className="absolute top-6 right-6 w-48 p-4 rounded-2xl bg-[var(--bg-card)]/80 backdrop-blur-xl border border-[var(--border-light)] shadow-2xl animate-in fade-in slide-in-from-right-4">
           <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: nodeColor(data.nodes.find(n => n.id === hoveredNode)?.type || '') }} />
              <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]">
                {data.nodes.find(n => n.id === hoveredNode)?.type}
              </p>
           </div>
           <h4 className="text-sm font-bold text-[var(--text-primary)] mb-1">
             {data.nodes.find(n => n.id === hoveredNode)?.name}
           </h4>
           <p className="text-[10px] text-[var(--text-tertiary)]">
             {data.nodes.find(n => n.id === hoveredNode)?.mention_count} appearances across the corpus.
           </p>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-6 right-6 flex gap-4 text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-tighter bg-[var(--bg-card)]/80 backdrop-blur-md px-4 py-2 rounded-xl border border-[var(--border-light)] shadow-xl opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-[#60a5fa]" /> Project</div>
        <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-[#fbbf24]" /> Idea</div>
        <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" /> Person</div>
        <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-[#a78bfa]" /> Goal</div>
      </div>

      <div className="absolute bottom-6 left-6 px-3 py-1.5 rounded-lg bg-[var(--bg-card)]/80 backdrop-blur-md border border-[var(--border-light)] text-[8px] font-mono text-[var(--text-tertiary)] uppercase tracking-widest shadow-xl flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <MousePointer2 size={10} /> Drag to explore · Wheel to zoom
      </div>
    </div>
  )
}
