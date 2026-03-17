'use client'

import { useState } from 'react'
import { Plus, Loader2, DollarSign, Utensils, Fuel, Home, Package } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface FinanceEntryPanelProps {
  onSaved: () => void
  initialDate?: Date
}

const CATEGORIES = [
  { id: 'food', label: 'Food', icon: Utensils, color: 'text-orange-400' },
  { id: 'gas', label: 'Gas', icon: Fuel, color: 'text-blue-400' },
  { id: 'rent', label: 'Rent', icon: Home, color: 'text-purple-400' },
  { id: 'work', label: 'Work', icon: DollarSign, color: 'text-emerald-400' },
  { id: 'other', label: 'Other', icon: Package, color: 'text-slate-400' },
]

export function FinanceEntryPanel({ onSaved, initialDate = new Date() }: FinanceEntryPanelProps) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    amount: '',
    type: 'expense' as 'income' | 'expense',
    category: 'food',
    description: '',
    date: initialDate.toISOString().split('T')[0]
  })
  const supabase = createClient()

  const handleSave = async () => {
    if (!form.amount) return
    setLoading(true)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { error } = await supabase.from('finance_logs').insert({
      user_id: session.user.id,
      amount: parseFloat(form.amount),
      type: form.type,
      category: form.category,
      description: form.description || null,
      logged_at: new Date(form.date).toISOString()
    })

    if (!error) {
      setForm({ ...form, amount: '', description: '' })
      onSaved()
    }
    setLoading(false)
  }

  return (
    <div className="space-y-8 bg-[var(--bg-secondary)] border border-[var(--border-light)] p-8 rounded-3xl">
      <div className="flex items-center justify-between">
         <h3 className="text-[10px] font-mono font-black uppercase tracking-[0.4em] text-[var(--accent)]">Data Entry</h3>
         <input 
          type="date" 
          value={form.date}
          onChange={e => setForm({...form, date: e.target.value})}
          className="bg-transparent text-[11px] font-mono text-[var(--text-tertiary)] outline-none border-b border-[var(--border-light)] focus:border-[var(--accent)] pb-1"
         />
      </div>

      <div className="space-y-6">
        {/* Toggle */}
        <div className="flex p-1 bg-[var(--bg-tertiary)] rounded-xl border border-[var(--border-light)]">
          <button
            onClick={() => setForm({ ...form, type: 'expense', category: 'food' })}
            className={`flex-1 py-2 text-[10px] font-mono font-black uppercase tracking-widest rounded-lg transition-all ${
              form.type === 'expense' ? 'bg-rose-500/10 text-rose-400' : 'text-[var(--text-tertiary)]'
            }`}
          >
            Cost
          </button>
          <button
            onClick={() => setForm({ ...form, type: 'income', category: 'work' })}
            className={`flex-1 py-2 text-[10px] font-mono font-black uppercase tracking-widest rounded-lg transition-all ${
              form.type === 'income' ? 'bg-emerald-500/10 text-emerald-400' : 'text-[var(--text-tertiary)]'
            }`}
          >
            Income
          </button>
        </div>

        {/* Amount */}
        <div className="relative group">
           <DollarSign className="absolute left-0 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] opacity-40 group-focus-within:opacity-100 transition-opacity" size={24} />
           <input
            type="number"
            value={form.amount}
            onChange={e => setForm({ ...form, amount: e.target.value })}
            placeholder="0.00"
            className="w-full bg-transparent border-b border-[var(--border-light)] pl-10 py-4 text-4xl font-black tracking-tighter placeholder:opacity-10 outline-none focus:border-[var(--accent)] transition-all"
           />
        </div>

        {/* Categories */}
        <div className="grid grid-cols-5 gap-2">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon
            const isActive = form.category === cat.id
            return (
              <button
                key={cat.id}
                onClick={() => setForm({ ...form, category: cat.id })}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                  isActive 
                    ? `bg-[var(--bg-tertiary)] border-[var(--accent)] ${cat.color} shadow-lg shadow-[var(--accent)]/5` 
                    : 'bg-transparent border-[var(--border-light)] text-[var(--text-tertiary)] opacity-40 hover:opacity-100'
                }`}
              >
                <Icon size={16} />
                <span className="text-[8px] font-mono font-black uppercase tracking-tighter">{cat.label}</span>
              </button>
            )
          })}
        </div>

        <input
          type="text"
          value={form.description}
          onChange={e => setForm({ ...form, description: e.target.value })}
          placeholder="Narrative description (optional)..."
          className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-xl px-4 py-3 text-[13px] font-light text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        />

        <button
          onClick={handleSave}
          disabled={loading || !form.amount}
          className="w-full py-4 bg-[var(--text-primary)] text-[var(--bg-primary)] rounded-xl text-[12px] font-mono font-black uppercase tracking-[0.2em] hover:opacity-90 disabled:opacity-30 transition-all flex items-center justify-center gap-2 shadow-2xl"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          Commit Entry
        </button>
      </div>
    </div>
  )
}
