import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Save, RotateCcw, Brain, X, Check, ShieldAlert } from 'lucide-react';

export interface IPDAParameters {
  delta_threshold: number;      // Phase Entrapment Threshold (λ₁)
  k_multiplier: number;         // Displacement Multiplier (λ₆)
  decay_constant: number;       // Temporal Decay Constant (λ fusion)
  regime_persistence: number;   // Bayesian Persistence (OBNFE)
  weights: number[];            // Institutional Sensor Weights [λ1, λ6, λ7, λ4, λ3]
}

interface MacroContext {
  dxy: number;
  spx: number;
  gold: number;
  vix: number;
  riskRegime: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
}

interface ExpansionSignal {
  confidence: number;
  direction: 'long' | 'short' | 'neutral';
  vetoReason: string | null;
  macroScore: number;
}

const DEFAULT_PARAMS: IPDAParameters = {
  delta_threshold: 0.7,
  k_multiplier: 1.2,
  decay_constant: 0.08,
  regime_persistence: 0.90,
  weights: [0.35, 0.25, 0.20, 0.15, 0.05]
};

const PRESETS: Record<string, IPDAParameters> = {
  'Conservative': { ...DEFAULT_PARAMS, delta_threshold: 0.6, k_multiplier: 1.5, weights: [0.4, 0.2, 0.2, 0.1, 0.1] },
  'Aggressive': { ...DEFAULT_PARAMS, delta_threshold: 0.85, k_multiplier: 1.0, weights: [0.2, 0.4, 0.3, 0.05, 0.05] },
  'Liquid': { ...DEFAULT_PARAMS, delta_threshold: 0.5, k_multiplier: 1.8, weights: [0.5, 0.1, 0.3, 0.05, 0.05] },
  'Sovereign Default': { ...DEFAULT_PARAMS }
};

export function IPDAParameterController({ 
  onExpansionSignal,
  marketContext,
  onClose
}: { 
  onExpansionSignal?: (signal: ExpansionSignal) => void;
  marketContext?: MacroContext;
  onClose?: () => void;
}) {
  const [params, setParams] = useState<IPDAParameters>(DEFAULT_PARAMS);
  const [customPresets, setCustomPresets] = useState<Record<string, IPDAParameters>>({});
  const [activePreset, setActivePreset] = useState('Sovereign Default');
  const [isCalibrating, setIsCalibrating] = useState(false);
  
  const [expansionSignal, setExpansionSignal] = useState<ExpansionSignal>({
    confidence: 0,
    direction: 'neutral',
    vetoReason: null,
    macroScore: 0
  });

  useEffect(() => {
    const saved = localStorage.getItem('quimeria_presets');
    if (saved) {
      try {
        setCustomPresets(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load presets", e);
      }
    }
  }, []);

  const syncParamsToBackend = async (newParams: IPDAParameters) => {
    try {
      await fetch('/api/smk/params', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newParams)
      });
    } catch (err) {
      console.warn('Param sync failed:', err);
    }
  };

  const calculateExpansionSignal = useCallback(() => {
    const simulatedVt = 0.65;
    const simulatedCandleRange = 1.2;
    const isEntrapped = simulatedVt < params.delta_threshold;
    const entrapmentScore = Math.max(0, 1 - (simulatedVt / params.delta_threshold));
    const isDisplaced = simulatedCandleRange > params.k_multiplier;
    const displacementScore = isDisplaced ? 1 : 0;
    
    let macroScore = 0.5;
    let vetoReason = null;
    if (marketContext) {
      const dxyImpact = marketContext.dxy > 105 ? -0.3 : (marketContext.dxy < 103 ? 0.3 : 0);
      const riskAlignment = marketContext.riskRegime === 'RISK_ON' ? 0.2 : marketContext.riskRegime === 'RISK_OFF' ? -0.2 : 0;
      macroScore = Math.max(0, Math.min(1, 0.5 + dxyImpact + riskAlignment));
      if (marketContext.riskRegime === 'RISK_OFF' && simulatedVt < 0.5) vetoReason = 'RISK-OFF REGIME + ENTRAPMENT = NO EXPANSION';
    }
    
    const decayFactor = Math.exp(-params.decay_constant * 5);
    const persistenceBonus = params.regime_persistence * 0.2;
    const lambdaScores = [entrapmentScore, displacementScore, macroScore, persistenceBonus, decayFactor];
    const rScore = lambdaScores.reduce((sum, score, i) => sum + score * params.weights[i], 0);
    
    let direction: 'long' | 'short' | 'neutral' = 'neutral';
    let confidence = 0;
    if (vetoReason) {
      confidence = 0; direction = 'neutral';
    } else if (rScore > 0.55 && isEntrapped && !isDisplaced) {
      direction = 'long'; confidence = rScore;
    } else if (rScore < 0.45 && isEntrapped && !isDisplaced) {
      direction = 'short'; confidence = 1 - rScore;
    }
    
    const signal: ExpansionSignal = { confidence, direction, vetoReason, macroScore };
    setExpansionSignal(signal);
    onExpansionSignal?.(signal);
  }, [params, marketContext, onExpansionSignal]);

  useEffect(() => {
    calculateExpansionSignal();
    syncParamsToBackend(params);
  }, [params, calculateExpansionSignal]);

  const handleSavePreset = () => {
    const name = prompt("Enter preset name:");
    if (name) {
      const updated = { ...customPresets, [name]: params };
      setCustomPresets(updated);
      localStorage.setItem('quimeria_presets', JSON.stringify(updated));
    }
  };

  const handleGeminiCalibrate = () => {
    setIsCalibrating(true);
    setTimeout(() => {
      const aiCalibrated = {
        ...params,
        delta_threshold: params.delta_threshold * (1 + (Math.random() * 0.1 - 0.05)),
        decay_constant: 0.08,
        weights: [0.3, 0.2, 0.3, 0.1, 0.1]
      };
      setParams(aiCalibrated);
      setIsCalibrating(false);
      setActivePreset('AI-OPTIMIZED-λ7');
    }, 1500);
  };

  return (
    <div className="absolute top-0 right-0 w-[400px] h-full bg-zinc-950/80 backdrop-blur-xl border-l border-white/10 z-50 flex flex-col p-8 shadow-2xl animate-in slide-in-from-right duration-300 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <h2 className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-black mb-1">Logic System Calibration</h2>
          <div className="text-2xl font-bold bg-gradient-to-r from-zinc-100 to-zinc-500 bg-clip-text text-transparent italic">KERNEL_IPDA</div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-zinc-500 transition-colors border border-transparent hover:border-white/10">
          <X size={20} />
        </button>
      </div>

      {/* Preset List Selection */}
      <div className="mb-10">
        <label className="text-[9px] uppercase tracking-widest text-zinc-600 block mb-4 font-black">Active Presets</label>
        <div className="flex flex-wrap gap-2">
          {[...Object.keys(PRESETS), ...Object.keys(customPresets)].map(p => (
            <button 
              key={p}
              onClick={() => { setParams(PRESETS[p] || customPresets[p]); setActivePreset(p); }}
              className={`px-3 py-1.5 text-[9px] font-bold border transition-all ${activePreset === p ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_15px_rgba(37,99,235,0.2)]' : 'bg-transparent border-white/10 text-zinc-500 hover:border-white/25'}`}
            >
              {p.toUpperCase().replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Main Parameters List */}
      <div className="flex-1 space-y-10 overflow-y-auto pr-4 scrollbar-hide">
        
        {/* λ1 Entrapment */}
        <div className="group">
          <div className="flex justify-between items-baseline mb-3">
            <span className="text-[11px] font-black text-zinc-300 tracking-wider uppercase">λ₁ Threshold (Entrapment)</span>
            <span className="text-sm text-blue-400 font-bold tabular-nums tracking-tighter">{params.delta_threshold.toFixed(2)} δ</span>
          </div>
          <div className="relative h-2 flex items-center">
            <div className="absolute inset-0 h-[1px] bg-white/10 top-1/2 -translate-y-1/2" />
            <input 
              type="range" min="0.3" max="1.2" step="0.01" 
              value={params.delta_threshold} 
              onChange={e => setParams({...params, delta_threshold: parseFloat(e.target.value)})}
              className="w-full bg-transparent appearance-none cursor-pointer accent-blue-500 h-8 relative z-10"
            />
          </div>
        </div>

        {/* λ6 Displacement */}
        <div className="group">
          <div className="flex justify-between items-baseline mb-3">
            <span className="text-[11px] font-black text-zinc-300 tracking-wider uppercase">λ₆ Displacement Constant</span>
            <span className="text-sm text-blue-400 font-bold tabular-nums tracking-tighter">{params.k_multiplier.toFixed(2)} κ</span>
          </div>
          <div className="relative h-2 flex items-center">
            <div className="absolute inset-0 h-[1px] bg-white/10 top-1/2 -translate-y-1/2" />
            <input 
              type="range" min="0.8" max="2.0" step="0.01" 
              value={params.k_multiplier} 
              onChange={e => setParams({...params, k_multiplier: parseFloat(e.target.value)})}
              className="w-full bg-transparent appearance-none cursor-pointer accent-blue-500 h-8 relative z-10"
            />
          </div>
        </div>

        {/* Weights List */}
        <div>
          <label className="text-[9px] uppercase tracking-widest text-zinc-600 block mb-6 font-black">Institutional Sensor Weights</label>
          <div className="space-y-8">
            {['λ₁ Entropy', 'λ₆ Kinetic', 'λ₇ Macro', 'λ₄ Persistence', 'λ₃ Harmony'].map((l, i) => (
              <div key={i}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-tight">{l}</span>
                  <span className="text-[10px] text-zinc-400 font-bold">{(params.weights[i] * 100).toFixed(0)}%</span>
                </div>
                <div className="relative h-1 flex items-center">
                  <div className="absolute inset-0 h-[1px] bg-white/5 top-1/2 -translate-y-1/2" />
                  <input 
                    type="range" min="0" max="0.5" step="0.01" 
                    value={params.weights[i]} 
                    onChange={e => {
                        const newWeights = [...params.weights];
                        newWeights[i] = parseFloat(e.target.value);
                        setParams({...params, weights: newWeights});
                    }}
                    className="w-full bg-transparent appearance-none cursor-pointer accent-blue-500 hover:accent-emerald-500 h-6 relative z-10 transition-all"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Controls & Summary */}
      <div className="mt-auto pt-8 border-t border-white/10 space-y-6">
        {/* Signal Summary */}
        <div className={`p-5 rounded-sm border transition-all ${expansionSignal.direction === 'neutral' ? 'bg-zinc-900/40 border-zinc-800' : (expansionSignal.direction === 'long' ? 'bg-emerald-500/5 border-emerald-500/20 shadow-[inset_0_0_20px_rgba(16,185,129,0.05)]' : 'bg-red-500/5 border-red-500/20 shadow-[inset_0_0_20px_rgba(239,68,68,0.05)]')}`}>
            <div className="flex justify-between items-center mb-1">
              <div>
                <div className="text-[8px] text-zinc-500 font-black uppercase mb-1 tracking-widest">Active Forecast</div>
                <div className={`text-2xl font-black italic tracking-tighter ${expansionSignal.direction === 'long' ? 'text-emerald-500' : (expansionSignal.direction === 'short' ? 'text-red-500' : 'text-zinc-500')}`}>
                  {expansionSignal.direction.toUpperCase()}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[8px] text-zinc-500 font-black uppercase mb-1 tracking-widest">Confidence Index</div>
                <div className="text-2xl font-black text-zinc-100 tabular-nums">{(expansionSignal.confidence * 100).toFixed(0)}%</div>
              </div>
            </div>
            {expansionSignal.vetoReason && (
              <div className="mt-4 flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/20 text-red-500 rounded-sm">
                <ShieldAlert size={12} className="shrink-0" />
                <span className="text-[9px] font-black tracking-tight leading-none uppercase">{expansionSignal.vetoReason}</span>
              </div>
            )}
        </div>

        {/* Global Controls */}
        <div className="grid grid-cols-2 gap-3">
            <button 
                onClick={handleGeminiCalibrate}
                className={`flex items-center justify-center gap-3 py-4 rounded-sm text-[11px] font-black tracking-widest border transition-all ${isCalibrating ? 'bg-blue-600/20 border-blue-400 text-blue-400' : 'bg-white/5 border-white/10 text-zinc-400 hover:border-blue-500 hover:text-white uppercase'}`}
            >
                <Brain size={16} className={isCalibrating ? 'animate-pulse' : ''} />
                {isCalibrating ? 'SYNCING_SYSTEM' : 'AI_CALIBRATE'}
            </button>
            <button 
                onClick={handleSavePreset}
                className="flex items-center justify-center gap-3 py-4 bg-white/5 rounded-sm text-[11px] font-black tracking-widest border border-white/10 text-zinc-400 hover:bg-white/10 hover:text-white transition-all uppercase"
            >
                <Save size={16} />
                SNAPSHOT_SET
            </button>
        </div>

        <button 
            onClick={() => { setParams(DEFAULT_PARAMS); setActivePreset('Sovereign Default'); }}
            className="w-full flex items-center justify-center gap-2 py-2 text-[9px] text-zinc-600 hover:text-zinc-300 transition-colors font-black uppercase tracking-[0.3em]"
        >
            <RotateCcw size={10} />
            Reset Kernel to Root
        </button>
      </div>
    </div>
  );
}
