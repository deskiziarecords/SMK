import React from 'react';
import { SMKResult } from '../types/smk';
import { TrendingUp, TrendingDown, Layers } from 'lucide-react';

interface StatsPanelProps {
  lastResult: SMKResult | undefined;
  activeModel: string;
  onModelChange: (model: string) => void;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({ lastResult, activeModel, onModelChange }) => {
  const pnl = lastResult?.session_pnl;

  return (
    <div className="space-y-4">
      {/* P&L Board */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-black/40 border border-white/10 p-3 rounded-lg">
          <div className="text-[10px] text-gray-500 mb-1 uppercase tracking-widest font-mono">Realized P&L</div>
          <div className={`text-lg font-mono font-bold ${pnl && pnl.realized >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            ${pnl?.realized.toFixed(2) || '0.00'}
          </div>
        </div>
        <div className="bg-black/40 border border-white/10 p-3 rounded-lg">
          <div className="text-[10px] text-gray-500 mb-1 uppercase tracking-widest font-mono">Unrealized P&L</div>
          <div className={`text-lg font-mono font-bold ${pnl && pnl.unrealized >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            ${pnl?.unrealized.toFixed(2) || '0.00'}
          </div>
        </div>
      </div>

      {/* Model Selection */}
      <div className="bg-black/40 border border-white/10 p-4 rounded-lg">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-blue-400" />
          <h3 className="text-xs font-mono text-gray-300 uppercase">Rev-Pred Engine</h3>
        </div>
        <div className="space-y-2">
          {['random_forest', 'logistic_regression'].map((m) => (
            <button
              key={m}
              onClick={() => onModelChange(m)}
              className={`w-full text-left px-3 py-2 rounded text-[11px] font-mono transition-all border ${
                activeModel === m 
                ? 'bg-blue-500/20 border-blue-500/50 text-blue-100 shadow-[0_0_10px_rgba(59,130,246,0.2)]' 
                : 'bg-white/5 border-transparent text-gray-500 hover:bg-white/10 hover:text-gray-300'
              }`}
            >
              {m.replace('_', ' ').toUpperCase()}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
           <span className="text-[9px] text-gray-600 font-mono italic">Adaptive Retraining: ACTIVE</span>
           <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_5px_#10b981]" />
        </div>
      </div>

      {/* Bias Summary */}
      <div className="bg-white/5 p-4 rounded-lg border border-white/5">
        <div className="flex justify-between items-center text-[10px] font-mono text-gray-500 mb-2 uppercase tracking-tight">
          <span>Directional Manifold</span>
          <span className="text-gray-700">RING-0</span>
        </div>
        <div className="flex items-center gap-3">
          {lastResult?.fusion?.p_fused && lastResult.fusion.p_fused > 0 ? (
            <TrendingUp className="w-6 h-6 text-emerald-500" />
          ) : (
            <TrendingDown className="w-6 h-6 text-red-500" />
          )}
          <div>
            <div className="text-sm font-mono text-white">
              {lastResult?.fusion?.regime || 'STASIS'}
            </div>
            <div className="text-[10px] text-gray-500 font-mono">
              CONF: {((lastResult?.fusion?.confidence || 0) * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
