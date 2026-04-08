'use client'

export const runtime = 'edge'


import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { 
  Plus, Search, Filter, ShieldCheck, Clock, ArrowUpRight, Wrench,
  Boxes, Car, Laptop, Home, Smartphone
} from 'lucide-react'

const CATEGORY_ICONS: Record<string, any> = {
  vehicle: Car,
  hardware: Laptop,
  property: Home,
  gear: Smartphone,
  other: Boxes,
  instrument: Wrench,
}

const CATEGORY_COLORS: Record<string, string> = {
  vehicle: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  hardware: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  property: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  gear: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  other: 'text-slate-400 bg-slate-400/10 border-slate-400/20',
}

export default function InventoryPage() {
  const [assets, setAssets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const supabase = createClient()

  useEffect(() => {
    async function loadAssets() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data } = await supabase
        .from('assets')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
      
      if (data) setAssets(data)
      setLoading(false)
    }
    loadAssets()
  }, [])

  const filteredAssets = assets.filter(a => {
    const nameMatch = (a.name || '').toLowerCase().includes(searchQuery.toLowerCase())
    const catMatch = (a.category || '').toLowerCase().includes(searchQuery.toLowerCase())
    return nameMatch || catMatch
  })

  if (loading) return <div className="p-8 animate-pulse text-[var(--text-tertiary)] font-mono uppercase tracking-widest text-xs">Loading Inventory...</div>

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 md:py-12 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--accent)] mb-2 flex items-center gap-2">
             <Boxes size={12} /> Asset Repository
          </h2>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">Inventory Loadout</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-2">Manage your physical and digital "gear" for real-world quests.</p>
        </div>
        <button className="btn btn-primary btn-sm flex items-center gap-2 px-6">
          <Plus size={16} /> Add New Asset
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 items-center bg-[var(--bg-secondary)] border border-[var(--border-light)] p-2 rounded-2xl shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={16} />
          <input 
            type="text" 
            placeholder="Search equipment..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--bg-primary)] border-none focus:ring-2 focus:ring-[var(--accent)] rounded-xl pl-10 pr-4 py-2 text-sm text-[var(--text-secondary)] placeholder:text-[var(--text-tertiary)]/50"
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto overflow-x-auto no-scrollbar">
           <button className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-tertiary)]/50 hover:bg-[var(--bg-tertiary)] rounded-xl border border-[var(--border-light)] text-xs font-semibold text-[var(--text-secondary)] transition-colors whitespace-nowrap">
             <Filter size={14} /> All Categories
           </button>
        </div>
      </div>

      {/* Grid */}
      {filteredAssets.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredAssets.map(asset => {
            const cat = asset.category || 'other'
            const Icon = CATEGORY_ICONS[cat] || Boxes
            const colorClass = CATEGORY_COLORS[cat] || CATEGORY_COLORS.other
            
            return (
              <div key={asset.id} className="group relative flex flex-col bg-[var(--bg-card)] border border-[var(--border-light)] rounded-2xl overflow-hidden hover:border-[var(--accent)] hover:shadow-xl transition-all duration-300">
                {/* Visual Area */}
                <div className="aspect-video relative overflow-hidden bg-[var(--bg-tertiary)]/30">
                  {asset.image_url ? (
                    <img src={asset.image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center opacity-40">
                      <Icon size={48} className={colorClass.split(' ')[0]} />
                    </div>
                  )}
                  <div className={`absolute top-3 right-3 px-2 py-1 rounded-lg border text-[9px] font-mono font-bold uppercase tracking-wider backdrop-blur-md ${colorClass}`}>
                    {cat}
                  </div>
                </div>

                {/* Content */}
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors line-clamp-1">{asset.name}</h3>
                    <ArrowUpRight size={14} className="text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)] line-clamp-2 mb-4 flex-1">
                    {asset.description || "No tactical description provided."}
                  </p>
                  
                  <div className="pt-4 border-t border-[var(--border-light)] flex items-center justify-between">
                     <div className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--text-tertiary)]">
                        <Clock size={12} />
                        <span>Updated {new Date(asset.updated_at).toLocaleDateString()}</span>
                     </div>
                     {!asset.is_public && (
                       <ShieldCheck size={14} className="text-rose-400" />
                     )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 bg-[var(--bg-secondary)] border border-dashed border-[var(--border-light)] rounded-3xl">
          <Boxes size={48} className="text-[var(--text-tertiary)] opacity-20 mb-4" />
          <h3 className="text-lg font-semibold text-[var(--text-secondary)]">Your inventory is empty</h3>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">Start tracking your assets to see them in your character loadout.</p>
          <button className="btn btn-primary btn-sm mt-6">
            Initialize Loadout
          </button>
        </div>
      )}
    </div>
  )
}
