import React, { useMemo } from 'react';
import { SMKResult } from '../types/smk';
import { motion } from 'motion/react';
import { Activity } from 'lucide-react';

interface SMKChartProps {
  results: SMKResult[];
  activeTrades: any[];
}

export const SMKChart: React.FC<SMKChartProps> = ({ results, activeTrades }) => {
  const lastResult = results[results.length - 1];
  
  if (!lastResult) return (
    <div className="h-full flex items-center justify-center text-gray-500 font-mono">
      NO DATA MANIFOLD DETECTED
    </div>
  );

  // Simple visualization of recent price
  const recentBars = results.slice(-50);
  const maxPrice = Math.max(...recentBars.map(b => b.bar.high));
  const minPrice = Math.min(...recentBars.map(b => b.bar.low));
  const range = maxPrice - minPrice || 1;

  return (
    <div className="relative h-full w-full bg-black/20 rounded-lg overflow-hidden border border-white/5 p-4">
       <div className="flex justify-between items-start mb-4">
          <div>
             <h2 className="text-xs font-mono text-gray-400 tracking-widest uppercase">Market Pulse</h2>
             <div className="text-2xl font-mono tabular-nums text-white">
                {lastResult.bar.close.toFixed(5)}
             </div>
          </div>
          <div className="text-right">
             <div className={`text-xs font-mono ${lastResult.reversal_prob && lastResult.reversal_prob > 0.7 ? 'text-red-400' : 'text-gray-500'}`}>
                REV PROB: {(lastResult.reversal_prob || 0).toFixed(2)}
             </div>
             <div className="text-[10px] text-gray-600 font-mono">
                VOL: {lastResult.bar.volume.toLocaleString()}
             </div>
          </div>
       </div>

       <div className="h-64 mt-4 relative flex items-end gap-1 px-2">
          {recentBars.map((r, i) => {
             const h = ((r.bar.close - minPrice) / range) * 100;
             const isUp = r.bar.close >= r.bar.open;
             return (
                <div key={i} className="flex-1 group relative h-full flex items-end">
                   <motion.div 
                      initial={{ height: 0 }}
                      animate={{ height: `${Math.max(2, h)}%` }}
                      className={`w-full rounded-t-sm transition-colors ${isUp ? 'bg-emerald-500/40 group-hover:bg-emerald-500/60' : 'bg-red-500/40 group-hover:bg-red-500/60'}`}
                   />
                </div>
             );
          })}

          {/* Value Lines */}
          {lastResult.execution?.is_armed && (
             <>
                <div 
                   className="absolute left-0 right-0 border-t border-dashed border-red-500/50 z-10"
                   style={{ bottom: `${((lastResult.execution.stop_loss_price - minPrice) / range) * 100}%` }}
                >
                   <span className="text-[8px] bg-red-950 text-red-500 px-1 absolute right-0 -top-3">SL</span>
                </div>
                <div 
                   className="absolute left-0 right-0 border-t border-dashed border-emerald-500/50 z-10"
                   style={{ bottom: `${((lastResult.execution.take_profit_price - minPrice) / range) * 100}%` }}
                >
                   <span className="text-[8px] bg-emerald-950 text-emerald-500 px-1 absolute right-0 -top-3">TP</span>
                </div>
             </>
          )}
       </div>

       {/* Order Flow Overlay */}
       {lastResult.order_flow && (
          <div className="mt-4 grid grid-cols-4 gap-2">
             <div className="bg-white/5 p-2 rounded">
                <div className="text-[9px] text-gray-500 tracking-tighter">DELTA</div>
                <div className={`text-xs font-mono font-bold ${lastResult.order_flow.delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                   {lastResult.order_flow.delta > 0 ? '+' : ''}{lastResult.order_flow.delta}
                </div>
             </div>
             <div className="bg-white/5 p-2 rounded">
                <div className="text-[9px] text-gray-500 tracking-tighter">ABSORPTION</div>
                <div className={`text-xs font-mono font-bold ${lastResult.order_flow.is_absorption ? 'text-orange-400' : 'text-gray-600'}`}>
                   {lastResult.order_flow.is_absorption ? 'DETECTED' : 'NONE'}
                </div>
             </div>
             <div className="bg-white/5 p-2 rounded">
                <div className="text-[9px] text-gray-500 tracking-tighter">TICKS</div>
                <div className="text-xs font-mono font-bold text-blue-400">
                   {(lastResult.order_flow.burst_density * 100).toFixed(0)}%
                </div>
             </div>
             <div className="bg-white/5 p-2 rounded">
                <div className="text-[9px] text-gray-500 tracking-tighter">PULSE</div>
                <div className={`text-xs font-mono font-bold ${lastResult.order_flow.pulse ? 'text-purple-400 animate-pulse' : 'text-gray-600'}`}>
                   {lastResult.order_flow.pulse ? 'ACTIVE' : 'STATIC'}
                </div>
             </div>
          </div>
       )}
    </div>
  );
};
