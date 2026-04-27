import React from 'react';

interface SentimentItem {
  tf: string;
  score: number;
}

interface AssetKineticMatrixProps {
  symbol?: string;
  sentimentData: SentimentItem[];
}

const AssetKineticMatrix: React.FC<AssetKineticMatrixProps> = ({ symbol, sentimentData }) => {
  // Helper to determine color based on score (-1 to 1)
  const getColor = (score: number) => {
    // Score -1 (Deep Red) to 1 (Deep Emerald)
    if (score > 0.6) return '#10b981'; // Strong Buy
    if (score > 0.1) return '#059669'; // Buy
    if (score < -0.6) return '#ef4444'; // Strong Sell
    if (score < -0.1) return '#dc2626'; // Sell
    return '#52525b'; // Neutral
  };

  const getLabel = (score: number) => {
    if (score > 0.6) return "STRONG BUY";
    if (score > 0.1) return "BUY";
    if (score < -0.6) return "STRONG SELL";
    if (score < -0.1) return "SELL";
    return "NEUTRAL";
  };

  const getIntensity = (score: number) => {
    return Math.abs(score);
  };

  return (
    <div className="flex flex-col h-full bg-white p-6 font-mono">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
        <div>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Kinetic Alignment</h2>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">{symbol || 'BTCUSDT'} / AGGREGATE</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">System 3 Matrix</div>
          <div className="text-[10px] text-slate-400">MULTIPLE_TIME_GRANULARITY</div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {sentimentData.map((item, index) => {
          const color = getColor(item.score);
          const intensity = getIntensity(item.score);
          
          return (
            <div 
              key={index} 
              className="bg-slate-50 border border-slate-100 p-4 rounded relative overflow-hidden group transition-all hover:bg-slate-100"
            >
              {/* Backglow for intensity */}
              <div 
                className="absolute inset-0 opacity-5 transition-opacity group-hover:opacity-10 pointer-events-none"
                style={{ background: color }}
              />
              
              <div className="flex justify-between items-start mb-4">
                <span className="text-sm font-bold text-slate-700">{item.tf}</span>
                <span 
                    className="text-[9px] px-1.5 py-0.5 rounded border font-bold"
                    style={{ color: color, borderColor: `${color}40`, background: `${color}10` }}
                >
                    {getLabel(item.score)}
                </span>
              </div>

              <div className="flex items-end gap-2">
                <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div 
                        className="h-full transition-all duration-1000"
                        style={{ 
                            width: `${(item.score + 1) * 50}%`,
                            background: `linear-gradient(90deg, #ef4444 0%, #cbd5e1 50%, #10b981 100%)`
                        }}
                    />
                </div>
                <span className="text-[10px] text-slate-400 w-8 text-right font-mono">
                    {item.score > 0 ? '+' : ''}{item.score.toFixed(2)}
                </span>
              </div>

              {/* Power Level Indicators */}
              <div className="flex gap-0.5 mt-2">
                {[...Array(10)].map((_, i) => (
                  <div 
                    key={i}
                    className={`h-0.5 flex-1 rounded-sm ${i < (intensity * 10) ? '' : 'bg-slate-200'}`}
                    style={{ background: i < (intensity * 10) ? color : undefined }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-auto pt-8 border-t border-slate-200 flex justify-between items-end text-slate-400">
        <div className="max-w-md">
            <p className="text-[10px] leading-relaxed italic">
                ALIGNMENT PROTOCOL: System identifies kinetic energy by measuring the coherence of bias across fractal granularities. 
                Full alignment creates maximum displacement probability. Divergence indicates local retracement within a larger regime.
            </p>
        </div>
        <div className="bg-slate-50 px-4 py-2 border border-slate-200 rounded">
            <div className="text-[8px] uppercase font-bold tracking-widest text-slate-500 mb-1">Coherence Status</div>
            <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                NOMINAL_SYNCHRONIZATION
            </div>
        </div>
      </div>
    </div>
  );
};

export default AssetKineticMatrix;
