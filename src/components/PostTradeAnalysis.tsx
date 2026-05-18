import React, { useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell, ReferenceLine, AreaChart, Area
} from 'recharts';
import { 
  TrendingUp, TrendingDown, DollarSign, Target, Activity, 
  Clock, Award, AlertCircle, ChevronRight, Download, RefreshCcw 
} from 'lucide-react';
import { ClosedTrade, TradeSummary } from '../types/trading';

interface PostTradeAnalysisProps {
  history: ClosedTrade[];
  initialBalance: number;
  onClose: () => void;
}

export const PostTradeAnalysis: React.FC<PostTradeAnalysisProps> = ({ 
  history, 
  initialBalance,
  onClose 
}) => {
  const summary: TradeSummary = useMemo(() => {
    const totalTrades = history.length;
    const wins = history.filter(t => t.profit > 0);
    const losses = history.filter(t => t.profit <= 0);
    
    const grossProfit = wins.reduce((sum, t) => sum + t.profit, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.profit, 0));
    const netProfit = grossProfit - grossLoss;
    
    const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 100 : 0);
    
    const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
    const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;

    // Calculate Max Drawdown
    let peak = initialBalance;
    let currentBalance = initialBalance;
    let maxDD = 0;
    
    // Sort by closedAt to build equity curve
    const sortedHistory = [...history].sort((a, b) => {
        const ta = typeof a.closedAt === 'number' ? a.closedAt : new Date(a.closedAt).getTime() / 1000;
        const tb = typeof b.closedAt === 'number' ? b.closedAt : new Date(b.closedAt).getTime() / 1000;
        return ta - tb;
    });

    sortedHistory.forEach(t => {
      currentBalance += t.profit;
      if (currentBalance > peak) peak = currentBalance;
      const dd = (peak - currentBalance) / peak * 100;
      if (dd > maxDD) maxDD = dd;
    });

    return {
      totalTrades,
      wins: wins.length,
      losses: losses.length,
      winRate,
      netProfit,
      grossProfit,
      grossLoss,
      profitFactor,
      avgWin,
      avgLoss,
      maxDrawdown: maxDD
    };
  }, [history, initialBalance]);

  const equityData = useMemo(() => {
    let currentBalance = initialBalance;
    const sortedHistory = [...history].sort((a, b) => {
        const ta = typeof a.closedAt === 'number' ? a.closedAt : new Date(a.closedAt).getTime() / 1000;
        const tb = typeof b.closedAt === 'number' ? b.closedAt : new Date(b.closedAt).getTime() / 1000;
        return ta - tb;
    });

    const data = sortedHistory.map((t, i) => {
      currentBalance += t.profit;
      return {
        index: i + 1,
        balance: currentBalance,
        profit: t.profit,
        pips: t.pips
      };
    });

    return [{ index: 0, balance: initialBalance, profit: 0, pips: 0 }, ...data];
  }, [history, initialBalance]);

  const distributionData = useMemo(() => {
    if (history.length === 0) return [];
    
    const profits = history.map(t => t.profit);
    const min = Math.min(...profits);
    const max = Math.max(...profits);
    const bucketSize = (max - min) / 10 || 1;
    
    const buckets: Record<string, number> = {};
    history.forEach(t => {
      const bucketIndex = Math.floor((t.profit - min) / bucketSize);
      const bucketLabel = (min + bucketIndex * bucketSize).toFixed(1);
      buckets[bucketLabel] = (buckets[bucketLabel] || 0) + 1;
    });

    return Object.entries(buckets).map(([label, count]) => ({
      label,
      count
    })).sort((a, b) => parseFloat(a.label) - parseFloat(b.label));
  }, [history]);

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 font-mono overflow-hidden animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-white/5 bg-zinc-900/50 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Award className="text-emerald-500" size={14} />
            <span className="text-[10px] uppercase font-black tracking-[0.3em] text-zinc-500">Post_Trade_Forensics.v2</span>
          </div>
          <h1 className="text-2xl font-black italic tracking-tighter bg-gradient-to-r from-white to-zinc-500 bg-clip-text text-transparent">
            QUIMERIA ANALYTICS CORE
          </h1>
        </div>
        
        <div className="flex items-center gap-4">
          <button className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-white/10 rounded text-[10px] font-black uppercase transition-all">
            <Download size={14} />
            Export XML
          </button>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/5 border border-white/5 rounded-full transition-all hover:rotate-90"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-hide">
        
        {/* Statistics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            label="NET_REALIZED_PNL" 
            value={`$${summary.netProfit.toFixed(2)}`} 
            subValue={`${((summary.netProfit / initialBalance) * 100).toFixed(2)}% ROI`}
            icon={<DollarSign className={summary.netProfit >= 0 ? "text-emerald-500" : "text-red-500"} />}
            trend={summary.netProfit >= 0 ? 'up' : 'down'}
          />
          <StatCard 
            label="WIN_RATE_ADJUSTED" 
            value={`${summary.winRate.toFixed(1)}%`} 
            subValue={`${summary.wins} W / ${summary.losses} L`}
            icon={<Target className="text-blue-500" />}
            trend={summary.winRate >= 50 ? 'up' : 'down'}
          />
          <StatCard 
            label="PROFIT_FACTOR_λ" 
            value={summary.profitFactor.toFixed(2)} 
            subValue={`Gross: +$${summary.grossProfit.toFixed(1)} / -$${summary.grossLoss.toFixed(1)}`}
            icon={<Activity className="text-purple-500" />}
            trend={summary.profitFactor >= 1.5 ? 'up' : 'down'}
          />
          <StatCard 
            label="MAX_DRAWDOWN_RECON" 
            value={`${summary.maxDrawdown.toFixed(2)}%`} 
            subValue="Peak-to-Valley Variance"
            icon={<AlertCircle className="text-amber-500" />}
            trend={summary.maxDrawdown < 5 ? 'up' : 'down'}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Equity Curve Chart */}
          <div className="lg:col-span-2 bg-zinc-900/40 border border-white/5 rounded-xl p-6 flex flex-col h-[400px]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Equity_Growth_Protocol</h2>
              <div className="px-3 py-1 bg-white/5 rounded-full text-[9px] font-bold text-zinc-400">SAMPLE_SIZE: {summary.totalTrades}</div>
            </div>
            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equityData}>
                    <defs>
                    <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                    <XAxis 
                        dataKey="index" 
                        stroke="#444" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                    />
                    <YAxis 
                        stroke="#444" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                        domain={['auto', 'auto']}
                        tickFormatter={(val) => `$${val}`}
                    />
                    <Tooltip 
                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', fontSize: '10px' }}
                        itemStyle={{ color: '#fff' }}
                    />
                    <Area 
                        type="monotone" 
                        dataKey="balance" 
                        stroke="#10b981" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorBalance)" 
                        animationDuration={1500}
                    />
                </AreaChart>
                </ResponsiveContainer>
            </div>
          </div>

          {/* Trade Distribution */}
          <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-6 flex flex-col h-[400px]">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500 mb-6">Pnl_Distribution_Noise</h2>
            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={distributionData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                        <XAxis 
                            dataKey="label" 
                            stroke="#444" 
                            fontSize={9} 
                            tickLine={false} 
                        />
                        <YAxis 
                            stroke="#444" 
                            fontSize={9} 
                            tickLine={false} 
                            axisLine={false}
                        />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', fontSize: '10px' }}
                        />
                        <Bar dataKey="count" animationDuration={1000}>
                            {distributionData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={parseFloat(entry.label) >= 0 ? '#10b981' : '#ef4444'} />
                            ))}
                        </Bar>
                        <ReferenceLine x="0" stroke="#555" />
                    </BarChart>
                </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Trade Journal Table */}
        <div className="bg-zinc-900/40 border border-white/5 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5 bg-zinc-800/30 flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Trade_Log_Sequence</h2>
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Database_Live</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-zinc-950/50 text-zinc-600 uppercase font-black tracking-wider">
                <tr>
                  <th className="px-6 py-3">ID</th>
                  <th className="px-6 py-3">TIMESTAMP</th>
                  <th className="px-6 py-3">SIDE</th>
                  <th className="px-6 py-3">SIZE</th>
                  <th className="px-6 py-3">ENTRY</th>
                  <th className="px-6 py-3">EXIT</th>
                  <th className="px-6 py-3">PIPS</th>
                  <th className="px-6 py-3">PROFIT</th>
                  <th className="px-6 py-3">VENUE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {history.length > 0 ? (
                  history.map((t) => (
                    <tr key={t.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-6 py-4 text-zinc-500">#{t.id}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                            <Clock size={12} className="text-zinc-600" />
                            {new Date(typeof t.closedAt === 'number' ? t.closedAt * 1000 : t.closedAt).toLocaleTimeString()}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${t.side === 'buy' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                          {t.side}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-bold">{t.lots}</td>
                      <td className="px-6 py-4 text-zinc-400">{t.price.toFixed(5)}</td>
                      <td className="px-6 py-4 text-zinc-400">{t.closePrice.toFixed(5)}</td>
                      <td className={`px-6 py-4 font-bold ${t.pips >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {t.pips >= 0 ? '+' : ''}{t.pips.toFixed(1)}
                      </td>
                      <td className={`px-6 py-4 font-bold ${t.profit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        ${t.profit.toFixed(2)}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[9px] px-1.5 py-0.5 bg-zinc-800 rounded border border-white/5 text-zinc-500 uppercase font-black">
                            {t.venue}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-zinc-600 animate-pulse font-black uppercase tracking-widest">
                      NO_HISTORICAL_DATA_FOUND_IN_SOVEREIGN_BUFFER
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ label, value, subValue, icon, trend }: { label: string, value: string | number, subValue: string, icon: React.ReactNode, trend?: 'up' | 'down' }) => (
  <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-5 hover:border-white/10 transition-all group relative overflow-hidden">
    <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 -mr-12 -mt-12 rounded-full blur-2xl group-hover:bg-white/10 transition-all" />
    <div className="flex items-start justify-between mb-4 relative z-10">
      <div className="p-2 bg-white/5 rounded-lg border border-white/5 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      {trend && (
        <div className={`flex items-center gap-1 ${trend === 'up' ? 'text-emerald-500' : 'text-red-500'}`}>
          {trend === 'up' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        </div>
      )}
    </div>
    <div className="relative z-10">
      <div className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-1">{label}</div>
      <div className="text-2xl font-black tabular-nums italic text-zinc-100">{value}</div>
      <div className="text-[10px] text-zinc-500 mt-1 font-bold">{subValue}</div>
    </div>
  </div>
);
