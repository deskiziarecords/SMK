import React from 'react';
import { OrderBook } from '../types/smk';
import { Activity } from 'lucide-react';

interface OrderFlowDeltaProfileProps {
  data: OrderBook | null;
}

const OrderFlowDeltaProfile: React.FC<OrderFlowDeltaProfileProps> = ({ data }) => {
  if (!data) return <div className="p-4 text-center text-zinc-500">Awaiting Order Flow...</div>;

  const allEntries = [...data.asks].reverse().concat(data.bids);
  const maxDelta = Math.max(...allEntries.map(e => Math.abs(e.delta || 0)), 1);
  const maxVol = Math.max(...allEntries.map(e => e.volume), 1);

  return (
    <div className="flex flex-col h-full bg-[#0d0d0f] font-mono text-[9px]">
      <div className="grid grid-cols-4 px-2 py-1 border-b border-zinc-800 text-zinc-500 font-bold uppercase sticky top-0 bg-[#0d0d0f] z-20">
        <span>Price</span>
        <span className="text-center">Delta Imbalance</span>
        <span className="text-right">Net</span>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {allEntries.map((entry, i) => {
          const isAsk = i < data.asks.length;
          const delta = entry.delta || 0;
          const deltaPercent = (Math.abs(delta) / maxDelta) * 100;
          
          return (
            <div key={`prof-${i}`} className={`relative grid grid-cols-4 px-2 py-1 items-center border-b border-zinc-900/30 hover:bg-zinc-800/20 group`}>
              {/* Central Delta Visualization */}
              <div className={`col-span-1 font-bold ${isAsk ? 'text-red-500/80' : 'text-green-500/80'} group-hover:text-zinc-100 transition-colors`}>
                {entry.price.toFixed(5)}
              </div>
              
              <div className="col-span-2 relative h-3 flex items-center justify-center">
                {/* Zero line */}
                <div className="absolute inset-y-0 left-1/2 w-[1px] bg-zinc-800" />
                
                {/* Delta Bar */}
                <div 
                  className={`absolute h-full transition-all duration-300 ${delta >= 0 ? 'bg-green-500/40 rounded-r-sm' : 'bg-red-500/40 rounded-l-sm'}`}
                  style={{ 
                    width: `${deltaPercent / 2}%`,
                    left: delta >= 0 ? '50%' : 'auto',
                    right: delta < 0 ? '50%' : 'auto'
                  }}
                />
                
                {/* Volume backdrop (faint) */}
                <div 
                  className="absolute inset-y-1 bg-zinc-800/20 rounded-full" 
                  style={{ width: `${(entry.volume / maxVol) * 100}%` }}
                />
              </div>

              <div className={`col-span-1 text-right font-bold ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {delta >= 0 ? '+' : ''}{delta.toFixed(1)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-2 border-t border-zinc-800 bg-zinc-900/20 flex justify-between items-center text-[8px]">
        <div className="flex items-center gap-2">
            <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 bg-green-500/40 rounded-full" /> BUY_DELTA</span>
            <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 bg-red-500/40 rounded-full" /> SELL_DELTA</span>
        </div>
        <div className="text-zinc-500 font-bold uppercase flex items-center">
            <Activity className="w-2 h-2 mr-1 text-blue-500" />
            Live Flow
        </div>
      </div>
    </div>
  );
};

export default OrderFlowDeltaProfile;
