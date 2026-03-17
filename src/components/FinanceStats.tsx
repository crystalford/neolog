import { TrendingUp, TrendingDown, Wallet, DollarSign, PieChart } from 'lucide-react'

interface FinanceStatsProps {
  monthlyIncome: number
  monthlyExpenses: number
  weeklyIncome: number
  weeklyExpenses: number
}

export function FinanceStats({ monthlyIncome, monthlyExpenses, weeklyIncome, weeklyExpenses }: FinanceStatsProps) {
  const netMonthly = monthlyIncome - monthlyExpenses
  const netWeekly = weeklyIncome - weeklyExpenses

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Monthly Net */}
      <div className="p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-light)] relative overflow-hidden group">
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Monthly Net</p>
            <PieChart size={14} className="text-[var(--accent)] opacity-40" />
          </div>
          <p className={`text-3xl font-black tracking-tighter ${netMonthly >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {netMonthly >= 0 ? '+' : ''}${Math.abs(netMonthly).toLocaleString()}
          </p>
          <div className="flex items-center gap-2 mt-4">
             <div className="flex items-center gap-1 text-[10px] text-emerald-400/80 font-mono">
                <TrendingUp size={10} /> ${monthlyIncome.toLocaleString()}
             </div>
             <div className="w-[1px] h-3 bg-[var(--border-light)]" />
             <div className="flex items-center gap-1 text-[10px] text-rose-400/80 font-mono">
                <TrendingDown size={10} /> ${monthlyExpenses.toLocaleString()}
             </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent)]/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-[var(--accent)]/10 transition-all duration-700" />
      </div>

      {/* Weekly Pulse */}
      <div className="p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-light)] relative overflow-hidden group">
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Weekly Pulse</p>
            <TrendingUp size={14} className="text-emerald-400 opacity-40" />
          </div>
          <p className={`text-3xl font-black tracking-tighter ${netWeekly >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {netWeekly >= 0 ? '+' : ''}${Math.abs(netWeekly).toLocaleString()}
          </p>
          <p className="text-[11px] text-[var(--text-tertiary)] mt-4 font-light italic opacity-60">
            Performance relative to previous cycle
          </p>
        </div>
      </div>

      {/* Cash Flow */}
      <div className="p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-light)] relative overflow-hidden group">
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Daily Average</p>
            <Wallet size={14} className="text-[var(--text-tertiary)] opacity-40" />
          </div>
          <p className="text-3xl font-black tracking-tighter text-[var(--text-primary)]">
            ${(monthlyIncome / 30).toFixed(0)}
          </p>
           <p className="text-[11px] text-[var(--text-tertiary)] mt-4 font-light italic opacity-60">
            Smoothed operational velocity
          </p>
        </div>
      </div>
    </div>
  )
}
