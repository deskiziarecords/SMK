import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Save, RotateCcw, Brain, X, Check, ShieldAlert, Activity } from 'lucide-react';

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
    <div className="absolute top-0 right-0 w-[420px] h-full bg-zinc-950/85 backdrop-blur-2xl border-l border-white/5 z-50 flex flex-col p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)] animate-in slide-in-from-right duration-500 font-mono">
      {/* Decorative Scanline Effect */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.02),rgba(0,255,0,0.01),rgba(0,0,255,0.02))] bg-[length:100%_2px,3px_100%] opacity-20" />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-12 relative">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Activity size={10} className="text-blue-500 animate-pulse" />
            <h2 className="text-[9px] uppercase tracking-[0.4em] text-zinc-500 font-black">Kernel calibration</h2>
          </div>
          <div className="text-3xl font-black bg-gradient-to-br from-white via-zinc-200 to-zinc-600 bg-clip-text text-transparent italic tracking-tighter">
            IPDA_CORE.exe
          </div>
        </div>
        <button 
          onClick={onClose} 
          className="group p-2.5 hover:bg-white/5 rounded-full text-zinc-500 transition-all border border-white/5 hover:border-white/20 hover:rotate-90"
        >
          <X size={20} />
        </button>
      </div>

      {/* Preset List Selection */}
      <div className="mb-12 relative">
        <div className="flex items-center justify-between mb-4">
          <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-black">Institutional_Profiles</label>
          <div className="h-[1px] flex-1 mx-4 bg-zinc-800/50" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[...Object.keys(PRESETS), ...Object.keys(customPresets)].map(p => (
            <button 
              key={p}
              onClick={() => { setParams(PRESETS[p] || customPresets[p]); setActivePreset(p); }}
              className={`relative overflow-hidden px-4 py-2.5 text-[10px] font-bold border transition-all ${activePreset === p ? 'bg-blue-600/10 border-blue-500/50 text-blue-400 shadow-[0_0_20px_rgba(37,99,235,0.15)]' : 'bg-zinc-900/20 border-white/5 text-zinc-600 hover:border-white/10 hover:text-zinc-400'}`}
            >
              {activePreset === p && <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />}
              <div className="flex justify-between items-center">
                <span>{p.toUpperCase().replace('_', ' ')}</span>
                {activePreset === p && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,1)]" />}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Parameters List */}
      <div className="flex-1 space-y-4 overflow-y-auto pr-2 scrollbar-hide relative">
        
        {/* Core Engine Metrics Section */}
        <div className="mb-6">
          <label className="text-[9px] uppercase tracking-[0.3em] text-zinc-700 block mb-4 font-black">CORE_ENGINE_METRICS</label>
          <div className="space-y-1">
            {/* λ1 Entrapment Row */}
            <div className="flex flex-col p-4 bg-white/[0.02] border border-white/5 hover:border-blue-500/30 transition-all group/row">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                  <div>
                    <h3 className="text-[11px] font-black text-zinc-100 uppercase tracking-wider">λ₁ Threshold</h3>
                    <p className="text-[8px] text-zinc-600 font-bold uppercase italic">Phase Entrapment Delta</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black text-blue-500 tabular-nums">{params.delta_threshold.toFixed(2)}</span>
                </div>
              </div>
              <input 
                type="range" min="0.3" max="1.2" step="0.01" 
                value={params.delta_threshold} 
                onChange={e => setParams({...params, delta_threshold: parseFloat(e.target.value)})}
                className="w-full h-1 bg-zinc-900 rounded-full appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3"
              />
            </div>

            {/* λ6 Displacement Row */}
            <div className="flex flex-col p-4 bg-white/[0.02] border border-white/5 hover:border-emerald-500/30 transition-all group/row">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  <div>
                    <h3 className="text-[11px] font-black text-zinc-100 uppercase tracking-wider">λ₆ K-Multiplier</h3>
                    <p className="text-[8px] text-zinc-600 font-bold uppercase italic">Kinetic Displacement κ</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black text-emerald-500 tabular-nums">{params.k_multiplier.toFixed(2)}</span>
                </div>
              </div>
              <input 
                type="range" min="0.8" max="2.0" step="0.01" 
                value={params.k_multiplier} 
                onChange={e => setParams({...params, k_multiplier: parseFloat(e.target.value)})}
                className="w-full h-1 bg-zinc-900 rounded-full appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3"
              />
            </div>
          </div>
        </div>

        {/* λ Sensor Weights Section */}
        <div>
          <label className="text-[9px] uppercase tracking-[0.3em] text-zinc-700 block mb-4 font-black">SENSOR_DISTRIBUTION_GRID</label>
          <div className="space-y-px bg-white/5 border border-white/5 overflow-hidden">
            {['λ₁ Entropy', 'λ₆ Kinetic', 'λ₇ Macro', 'λ₄ Persist', 'λ₃ Harmonic'].map((l, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 bg-zinc-950/40 hover:bg-white/[0.03] transition-colors border-b border-white/5 last:border-0 group/weight">
                <div className="w-20 shrink-0">
                  <span className="text-[9px] text-zinc-500 font-black uppercase tracking-tighter truncate block">{l}</span>
                </div>
                <div className="flex-1 h-0.5 bg-zinc-900 relative">
                  <div className="absolute top-0 left-0 h-full bg-zinc-700 transition-all" style={{ width: `${(params.weights[i] * 100 * 2)}%` }} />
                  <input 
                    type="range" min="0" max="0.5" step="0.01" 
                    value={params.weights[i]} 
                    onChange={e => {
                        const newWeights = [...params.weights];
                        newWeights[i] = parseFloat(e.target.value);
                        setParams({...params, weights: newWeights});
                    }}
                    className="absolute inset-0 w-full bg-transparent appearance-none cursor-pointer accent-blue-500 opacity-0 hover:opacity-100 transition-opacity [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500"
                  />
                </div>
                <div className="w-10 text-right">
                  <span className="text-[10px] text-zinc-400 font-bold tabular-nums">{(params.weights[i] * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Controls & Summary */}
      <div className="mt-auto pt-8 border-t border-white/5 space-y-6 bg-zinc-950/20 -mx-4 px-4 pb-4 relative overflow-hidden">
        
        {/* Signal Summary */}
        <div className={`relative p-6 rounded-lg border transition-all duration-500 overflow-hidden ${expansionSignal.direction === 'neutral' ? 'bg-zinc-900/50 border-zinc-800' : (expansionSignal.direction === 'long' ? 'bg-emerald-950/30 border-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.1)]' : 'bg-red-950/30 border-red-500/40 shadow-[0_0_30px_rgba(239,68,68,0.1)]')}`}>
            {/* Animated signal intensity bars */}
            <div className="absolute bottom-0 left-0 w-full h-1 bg-zinc-900/50">
               <div className={`h-full transition-all duration-1000 ${expansionSignal.direction === 'long' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,1)]' : (expansionSignal.direction === 'short' ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,1)]' : 'bg-blue-500/50')}`} style={{ width: `${(expansionSignal.confidence * 100)}%` }} />
            </div>

            <div className="flex justify-between items-start mb-2 relative z-10">
              <div>
                <div className="text-[10px] text-zinc-500 font-black uppercase mb-1 tracking-[0.2em]">Active_Forecast</div>
                <div className={`text-3xl font-black italic tracking-tighter ${expansionSignal.direction === 'long' ? 'text-emerald-500' : (expansionSignal.direction === 'short' ? 'text-red-500' : 'text-zinc-500')}`}>
                  {expansionSignal.direction.toUpperCase()}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-zinc-500 font-black uppercase mb-1 tracking-[0.2em]">Confidence</div>
                <div className="text-3xl font-black text-zinc-100 tabular-nums tracking-tighter italic">{(expansionSignal.confidence * 100).toFixed(0)}%</div>
              </div>
            </div>
            
            {expansionSignal.vetoReason && (
              <div className="mt-4 flex items-center gap-3 p-3 bg-red-950/40 border border-red-500/20 text-red-500 rounded relative z-10">
                <ShieldAlert size={14} className="shrink-0 animate-pulse" />
                <span className="text-[10px] font-black tracking-tight leading-none uppercase">{expansionSignal.vetoReason}</span>
              </div>
            )}
        </div>

        {/* Global Controls */}
        <div className="grid grid-cols-2 gap-3 relative z-10">
            <button 
                onClick={handleGeminiCalibrate}
                className={`relative group flex items-center justify-center gap-3 py-4 rounded-lg text-[11px] font-black tracking-widest border transition-all duration-300 ${isCalibrating ? 'bg-blue-600/30 border-blue-400 text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.3)]' : 'bg-zinc-900 border-white/5 text-zinc-500 hover:border-blue-500/50 hover:text-white uppercase overflow-hidden'}`}
            >
                {isCalibrating && <div className="absolute inset-0 bg-blue-500/10 animate-pulse" />}
                <Brain size={18} className={isCalibrating ? 'animate-bounce' : 'group-hover:text-blue-500 transition-colors'} />
                {isCalibrating ? 'CALIBRATING...' : 'AI_AUTO_TUNE'}
            </button>
            <button 
                onClick={handleSavePreset}
                className="group flex items-center justify-center gap-3 py-4 bg-zinc-900 rounded-lg text-[11px] font-black tracking-widest border border-white/5 text-zinc-500 hover:bg-zinc-800 hover:text-white transition-all duration-300 uppercase"
            >
                <Save size={18} className="group-hover:text-emerald-500 transition-colors" />
                COMMIT_SET
            </button>
        </div>

        <button 
            onClick={() => { setParams(DEFAULT_PARAMS); setActivePreset('Sovereign Default'); }}
            className="w-full flex items-center justify-center gap-2 py-2 text-[10px] text-zinc-700 hover:text-zinc-400 transition-all font-black uppercase tracking-[0.4em] hover:scale-105"
        >
            <RotateCcw size={12} />
            FACTORY_RESET_CORE
        </button>
      </div>
    </div>
  );
}
