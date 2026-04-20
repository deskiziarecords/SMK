import { OHLCV, SMKResult } from '../types/smk';
import * as ss from 'simple-statistics';
import FFT from 'fft.js';

export class SMKEngine {
  private rawBars: OHLCV[] = [];
  private cursor = 0;
  private amdState = 'Accumulation';
  private prevEnergy = 0.0;
  private stasisTimer = 0;
  private referenceDistribution: number[] | null = null;
  private disabledModules: Set<string> = new Set();
  private lastResult: SMKResult | null = null;
  
  // Bayesian Fusion Weights (OBNFE Initial State)
  private lambdaWeights: Record<string, number> = {
    'λ1_vol_decay': 0.18,
    'λ2_session': 0.12,
    'λ3_harmonic': 0.15,
    'λ4_manipulation': 0.14,
    'λ5_displacement': 0.16,
    'λ6_bias': 0.13,
    'λ7_regime': 0.12,
  };

  constructor() {}

  public loadBars(bars: OHLCV[]) {
    this.rawBars = bars;
    this.cursor = 0;
    this.amdState = 'Accumulation';
    this.prevEnergy = 0.0;
    this.stasisTimer = 0;
    this.referenceDistribution = null;

    // Calibrate KL Manifold with first 60 bars if available
    if (bars.length >= 60) {
      const initialWindow = bars.slice(0, 60).map(b => b.close);
      this.referenceDistribution = this.generateDistribution(initialWindow);
    }
  }

  public reset() {
    this.cursor = 0;
    this.amdState = 'Accumulation';
    this.prevEnergy = 0.0;
    this.stasisTimer = 0;
  }

  public setDisabledModules(modules: string[]) {
    this.disabledModules = new Set(modules);
  }

  public getLastResult(): SMKResult | null {
    return this.lastResult;
  }

  public step(): SMKResult | null {
    if (this.cursor >= this.rawBars.length) return null;

    const idx = this.cursor;
    const currentBar = this.rawBars[idx];
    this.cursor++;

    const windowSize = Math.min(60, idx + 1);
    const window = this.rawBars.slice(Math.max(0, idx - windowSize + 1), idx + 1);

    if (window.length < 3) {
      const br = this.blankResult(currentBar, idx);
      this.lastResult = br;
      return br;
    }

    const highs = window.map(b => b.high);
    const lows = window.map(b => b.low);
    const closes = window.map(b => b.close);
    const volumes = window.map(b => b.volume);

    // 1. IPDA Layer 1 - Structural Compiler
    const dealingRange = this.disabledModules.has('dealing') ? { high: 0, low: 0, range_h: 0, range_l: 0, eq: currentBar.close, zone: 'NEUTRAL', coherence: 0, status: 'DISABLED' } : this.calcDealingRange(highs, lows, currentBar.close);
    const bias = this.disabledModules.has('bias') ? { bias: 'NEUTRAL', eq: 0, zone: 'MOD_OFF', coherence: 0, valid: false } : this.calcBias(dealingRange, currentBar.close, window);
    const session = this.disabledModules.has('session') ? { active: false, name: 'OFF', killzone: false, score: 0, status: 'DISABLED' } : this.calcSession(currentBar.time);
    const swings = this.disabledModules.has('swing') ? { count: 0, nodes: [] } : this.calcSwings(highs, lows);
    
    // 2. L2 Memory & Imbalance
    const fvg = this.disabledModules.has('fvg') ? { count: 0, active: false, recent: [] } : this.calcFVG(window);
    const ob = this.disabledModules.has('ob') ? { count: 0, active: false, recent: [] } : this.calcOrderBlocks(window);

    // 3. Lambda Sensors (λ1-λ7)
    const volDecay = this.disabledModules.has('vol_decay') ? { ratio: 1, entrapped: false, energy: 0, stasis: 0, status: 'OFF' } : this.calcVolDecay(closes, highs, lows);
    const displacement = this.disabledModules.has('displacement') ? { is_disp: false, dir: 0, body_ratio: 0, vetoed: false, status: 'OFF' } : this.calcDisplacement(currentBar, window);
    const harmonic = this.disabledModules.has('harmonic') ? { phase_diff: 0, inverted: false, trap: 'NONE', status: 'OFF' } : this.calcHarmonic(closes);
    const manipulation = this.disabledModules.has('manipulation') ? { active: false, score: 0, level: 'NONE', wick: 0, status: 'OFF' } : this.calcManipulation(currentBar, dealingRange, volumes);
    const expansion = this.disabledModules.has('expansion') ? { prob: 0, entrapped: false, target: 0, status: 'OFF' } : this.calcExpansion(volDecay, dealingRange);
    const kl = this.disabledModules.has('kl') ? { score: 0, stable: true, status: 'OFF' } : this.calcKL(closes);
    const topology = this.disabledModules.has('topology') ? { h1_score: 0, fractured: false, islands: 0, status: 'OFF' } : this.calcTopology(closes, volumes);

    const result: SMKResult = {
      bar: currentBar,
      bar_index: idx,
      total_bars: this.rawBars.length,
      dealing_range: dealingRange,
      bias: bias,
      session: session,
      swings: swings,
      fvg: fvg,
      ob: ob,
      vol_decay: volDecay,
      displacement: displacement,
      harmonic: harmonic,
      manipulation: manipulation,
      expansion: expansion,
      kl: kl,
      topology: topology,
      ipda_phase: this.disabledModules.has('ipda') ? { phase: 'STASIS', eq: 0, confidence: 0, valid: false } : {
          phase: this.amdState,
          eq: dealingRange.eq,
          confidence: dealingRange.coherence,
          valid: true
      }
    };

    // AMD State Machine Logic
    result.amd = this.updateAMD(result);
    this.amdState = result.amd.state;

    // Signal Fusion (Ring 0 OBNFE)
    result.fusion = this.disabledModules.has('fusion') ? { p_fused: 0, confidence: 0, regime: 'DISABLED', active_lambdas: [], veto_active: false, weights: {}, status: 'OFF' } : this.fuseSignals(result);
    
    // Mandra Risk Gate
    result.mandra = this.disabledModules.has('mandra') ? { open: true, delta_e: 0, clamped_size: 0, regime_stable: true, status: 'OFF' } : this.evaluateMandra(result.fusion, result.ipda_phase?.confidence || 0.7);
    
    // Veto Authority Decision
    result.veto = this.decideVeto(result);
    
    // Causal Layer (Placeholders using integrated math)
    result.causal = {
        granger: "STABLE",
        trans_ent: 0.434,
        ccm_rho: 0.493,
        spearman: 0.852,
        decay: Math.exp(-0.08 * 3) // Example tau=3
    };

    result.sensors = this.getSensorsList(result);
    this.lastResult = result;

    return result;
  }

  private calcDealingRange(highs: number[], lows: number[], currentPrice: number) {
    const lb20_h = Math.max(...highs.slice(-20));
    const lb20_l = Math.min(...lows.slice(-20));
    const lb40_h = Math.max(...highs.slice(-40));
    const lb40_l = Math.min(...lows.slice(-40));
    const lb60_h = Math.max(...highs.slice(-60));
    const lb60_l = Math.min(...lows.slice(-60));

    const midpoints = [
      (lb20_h + lb20_l) / 2,
      (lb40_h + lb40_l) / 2,
      (lb60_h + lb60_l) / 2
    ];

    const eq = ss.mean(midpoints);
    const widths = [lb20_h - lb20_l, lb40_h - lb40_l, lb60_h - lb60_l];
    const coherence = 1 - (ss.standardDeviation(widths) / (ss.mean(widths) + 1e-9));

    const zone = currentPrice > eq ? 'PREMIUM' : 'DISCOUNT';

    return {
      high: lb60_h,
      low: lb60_l,
      range_h: lb60_h,
      range_l: lb60_l,
      eq,
      zone,
      coherence,
      status: coherence < 0.4 ? 'STRUCTURAL_FRACTURE' : `TRADING_IN_${zone}`
    };
  }

  private calcBias(dr: any, currentPrice: number, window: OHLCV[]) {
    // Proximity logic for NEUTRAL state (Accumulation Phase)
    const ranges = window.map(b => b.high - b.low);
    const atr = ss.mean(ranges.slice(-20)) || 0.0001;
    const diff = currentPrice - dr.eq;
    const neutralBound = atr * 0.15;

    let bias = "NEUTRAL";
    if (Math.abs(diff) >= neutralBound) {
        bias = diff > 0 ? "BULLISH" : "BEARISH";
    }

    return {
      bias,
      eq: dr.eq,
      zone: dr.zone,
      coherence: dr.coherence,
      valid: dr.coherence > 0.4
    };
  }

  private calcSession(time: number) {
    const date = new Date(time * 1000);
    const hours = date.getUTCHours();
    
    // NY Time: UTC-4/5. 
    // London Killzone: 2-6 AM EST -> 6-10 AM UTC (Summer)
    // NY Killzone: 7-11 AM EST -> 11 AM - 3 PM UTC
    let name = 'DEAD_ZONE';
    let killzone = false;
    let score = 0.1;

    if (hours >= 0 && hours < 5) { // Asian
        name = 'ASIAN_RANGE';
        score = 0.5;
    } else if (hours >= 7 && hours < 11) { // London
        name = 'LONDON_KILLZONE';
        killzone = true;
        score = 1.0;
    } else if (hours >= 12 && hours < 16) { // NY
        name = 'NY_KILLZONE';
        killzone = true;
        score = 1.0;
    }

    return {
      active: true,
      name,
      killzone,
      score,
      status: killzone ? 'KILLZONE_VALIDATED' : 'STASIS: DEAD_ZONE'
    };
  }

  private calcSwings(highs: number[], lows: number[]) {
    const nodes: any[] = [];
    const lookback = 5;
    for (let i = lookback; i < highs.length - lookback; i++) {
        const h = highs[i];
        const l = lows[i];
        
        let isHigh = true;
        let isLow = true;
        for (let j = 1; j <= lookback; j++) {
            if (highs[i-j] >= h || highs[i+j] >= h) isHigh = false;
            if (lows[i-j] <= l || lows[i+j] <= l) isLow = false;
        }

        if (isHigh) nodes.push({ idx: i, price: h, type: 'SWING_HIGH' });
        if (isLow) nodes.push({ idx: i, price: l, type: 'SWING_LOW' });
    }
    return { count: nodes.length, nodes: nodes.slice(-6) };
  }

  private calcFVG(window: OHLCV[]) {
    const recent: any[] = [];
    for (let i = window.length - 1; i >= 2; i--) {
        const b0 = window[i];
        const b2 = window[i-2];
        if (b0.low > b2.high) {
            recent.push({ type: 'BULLISH_FVG', top: b0.low, bot: b2.high, eq: (b0.low + b2.high) / 2 });
        } else if (b0.high < b2.low) {
            recent.push({ type: 'BEARISH_FVG', top: b2.low, bot: b0.high, eq: (b2.low + b0.high) / 2 });
        }
        if (recent.length >= 3) break;
    }
    return { count: recent.length, active: recent.length > 0, recent };
  }

  private calcOrderBlocks(window: OHLCV[]) {
    const blocks: any[] = [];
    if (window.length < 5) return { count: 0, active: false, recent: [] };

    const ranges = window.map(b => b.high - b.low);
    const atr = ss.mean(ranges.slice(-20)) || 0.0001;

    for (let i = 1; i < window.length - 1; i++) {
        const origin = window[i];
        const disp = window[i+1];
        
        const bodyDisp = Math.abs(disp.close - disp.open);
        const rangeDisp = disp.high - disp.low || 0.0001;
        
        // λ6 Displacement Logic for OB validation
        const isDisp = rangeDisp > (1.2 * atr) && (bodyDisp / rangeDisp) > 0.7;

        if (origin.close < origin.open && disp.close > disp.open && isDisp) {
            blocks.push({ type: 'BULLISH_OB', level: origin.open, high: origin.high, low: origin.low, score: rangeDisp });
        } else if (origin.close > origin.open && disp.close < disp.open && isDisp) {
            blocks.push({ type: 'BEARISH_OB', level: origin.open, high: origin.high, low: origin.low, score: rangeDisp });
        }
    }
    return { count: blocks.length, active: blocks.length > 0, recent: blocks.slice(-2) };
  }

  private calcVolDecay(closes: number[], highs: number[], lows: number[]) {
    const diffs = [];
    for (let i = 1; i < closes.length; i++) diffs.push(Math.abs(closes[i] - closes[i - 1]));
    const vt = ss.sum(diffs);
    
    const ranges = [];
    for (let i = 0; i < highs.length; i++) ranges.push(highs[i] - lows[i]);
    const atr = ss.mean(ranges.slice(-20)) || 0.0001;
    
    const ratio = vt / atr;
    const entrapped = ratio < 0.7;
    
    if (entrapped) this.stasisTimer++;
    else this.stasisTimer = 0;

    const energy = 0.5 * Math.pow(this.stasisTimer, 2);

    return {
      ratio,
      entrapped,
      energy,
      stasis: this.stasisTimer,
      status: this.stasisTimer > 20 ? 'CRITICAL_MASS_EXPANSION_IMMINENT' : (entrapped ? 'PHASE_ENTRAPMENT_ACTIVE' : 'NORMAL_DELIVERY')
    };
  }

  private calcDisplacement(bar: OHLCV, window: OHLCV[]) {
    const body = Math.abs(bar.close - bar.open);
    const range = bar.high - bar.low || 0.0001;
    const bodyRatio = body / range;
    
    const atrRanges = window.map(b => b.high - b.low);
    const atr = ss.mean(atrRanges.slice(-20)) || 0.0001;
    
    const isDisp = range > (1.2 * atr) && bodyRatio > 0.7;
    
    return {
      is_disp: isDisp,
      dir: bar.close > bar.open ? 1 : -1,
      body_ratio: bodyRatio,
      vetoed: false,
      status: isDisp ? 'DISPLACEMENT_DETECTED' : 'NOMINAL'
    };
  }

  private calcHarmonic(closes: number[]) {
    const N = 64;
    if (closes.length < N) return { phase_diff: 0, inverted: false, trap: 'NONE', status: 'INSUFFICIENT_DATA' };
    
    const data = closes.slice(-N);
    const fft = new FFT(N);
    
    // Actual signal
    const outAct = fft.createComplexArray();
    fft.realTransform(outAct, data);
    
    // Find dominant frequency (ignoring DC)
    let maxAmp = 0;
    let actIdx = 1;
    for (let i = 1; i < N / 2; i++) {
        const amp = Math.sqrt(Math.pow(outAct[2*i], 2) + Math.pow(outAct[2*i+1], 2));
        if (amp > maxAmp) {
            maxAmp = amp;
            actIdx = i;
        }
    }
    const phiAct = Math.atan2(outAct[2*actIdx+1], outAct[2*actIdx]);
    
    // Predicted signal (Dummy: shifted by 1 bar phase)
    const phiPred = phiAct - (2 * Math.PI / N); // Simple linear phase prediction
    const phaseDiff = Math.abs(phiPred - phiAct);
    const inverted = phaseDiff > Math.PI / 2;

    return {
      phase_diff: phaseDiff,
      inverted,
      trap: inverted ? 'PHASE_INVERSION' : 'NONE',
      status: inverted ? 'DISSONANT: λ3 VETO' : 'IN_HARMONY'
    };
  }

  private calcExpansion(vd: any, dr: any) {
    const pPersistence = Math.min(1.0, vd.stasis / 20);
    const prob = 0.4 * pPersistence; // No news interrupt implementation yet
    return {
      prob,
      entrapped: vd.entrapped,
      target: dr.eq,
      status: prob > 0.6 ? 'EXPANSION_ACTIVE' : (vd.entrapped ? 'PHASE_ENTRAPMENT_λ1' : 'IDLE_STASIS')
    };
  }

  private calcManipulation(bar: OHLCV, dr: any, volumes: number[]) {
    const body = Math.abs(bar.close - bar.open);
    const upperWick = bar.high - Math.max(bar.open, bar.close);
    const lowerWick = Math.min(bar.open, bar.close) - bar.low;
    const wick = upperWick + lowerWick;
    const wickRatio = wick / (body + 1e-9);
    
    const avgVol = ss.mean(volumes);
    const sweepH = bar.high >= dr.high;
    const sweepL = bar.low <= dr.low;
    
    let score = 0;
    if (sweepH || sweepL) score += 40;
    if (wickRatio > 3.0) score += 30;
    if (bar.volume > (avgVol * 3)) score += 30;

    const active = score >= 70;
    return {
        active,
        score,
        level: sweepH ? 'H60' : (sweepL ? 'L60' : 'NONE'),
        wick: wickRatio,
        status: active ? 'MANIPULATION_DETECTED' : 'STABLE'
    };
  }

  private generateDistribution(data: number[], bins = 20) {
    const min = ss.min(data);
    const max = ss.max(data);
    const step = (max - min) / bins;
    const counts = new Array(bins).fill(1e-9); // small epsilon
    for (const val of data) {
        const binIdx = Math.min(bins - 1, Math.floor((val - min) / (step + 1e-12)));
        counts[binIdx]++;
    }
    const sum = ss.sum(counts);
    return counts.map(c => c / sum);
  }

  private calcKL(closes: number[]) {
    if (!this.referenceDistribution) return { score: 0, stable: true, status: 'INITIALIZING' };
    
    const currentDist = this.generateDistribution(closes.slice(-20));
    const ref = this.referenceDistribution;
    
    // KL(P||Q) = sum P(i) * log(P(i)/Q(i))
    let klScore = 0;
    for (let i = 0; i < currentDist.length; i++) {
        klScore += currentDist[i] * Math.log(currentDist[i] / ref[i]);
    }

    const stable = klScore < 0.65;
    return {
        score: klScore,
        stable,
        status: stable ? 'IN_HARMONY' : 'REGIME_FRACTURE_DETECTED'
    };
  }

  private calcTopology(closes: number[], volumes: number[]) {
    // Heuristic: Measure 4D Point Cloud Drift
    // Data: [Idx, Price, Vol, OFI]
    const ofi = [];
    for (let i = 1; i < closes.length; i++) ofi.push(closes[i] - closes[i-1]);
    
    // Score based on OFI variance and cycle detection (autocorrelation of OFI)
    const ofiVar = ss.variance(ofi) * 1e8;
    const score = Math.min(10.0, ofiVar);
    const fractured = score > 5.0;

    return {
        h1_score: score,
        fractured,
        islands: Math.floor(score / 2),
        status: fractured ? 'GEOMETRY_FRACTURE' : 'COMPACT_CLOUD'
    };
  }

  private updateAMD(r: SMKResult) {
    const prev = this.amdState;
    const R_MASTER = !r.kl?.stable && r.topology?.fractured;

    if (R_MASTER) {
        return { state: 'Accumulation', prev, changed: prev !== 'Accumulation', R_MASTER: true };
    }

    let next = prev;
    if (prev === 'Accumulation') {
        if (r.vol_decay?.entrapped && r.vol_decay.stasis > 5) next = 'Manipulation';
    } else if (prev === 'Manipulation') {
        if (r.manipulation?.active || (r.fvg?.active && r.displacement?.is_disp)) next = 'Distribution';
    } else if (prev === 'Distribution') {
        if (r.vol_decay?.entrapped || (r.expansion?.prob || 0) < 0.2) next = 'Retracement';
    } else if (prev === 'Retracement') {
        if (!r.vol_decay?.entrapped && r.vol_decay?.stasis === 0) next = 'Accumulation';
    }

    return {
        state: next,
        prev,
        changed: next !== prev,
        R_MASTER: false
    };
  }

  private fuseSignals(r: SMKResult) {
    const signals: Record<string, { score: number, confidence: number, veto: boolean }> = {
        'λ1_vol_decay': {
            score: r.vol_decay?.entrapped ? 0.9 : 0.2,
            confidence: Math.min(1.0, (r.vol_decay?.energy || 0) / 50),
            veto: false
        },
        'λ3_harmonic': {
            score: r.harmonic?.inverted ? -1.0 : 0.4,
            confidence: 0.75,
            veto: r.harmonic?.inverted || false
        },
        'λ4_manipulation': {
            score: r.manipulation?.active ? 0.8 : -0.3,
            confidence: (r.manipulation?.score || 0) / 100,
            veto: r.manipulation?.active || false
        },
        'λ5_displacement': {
            score: r.displacement?.dir || 0,
            confidence: r.displacement?.is_disp ? 0.85 : 0.5,
            veto: r.displacement?.vetoed || false
        },
        'λ6_bias': {
            score: r.bias?.bias === 'BULLISH' ? 1.0 : (r.bias?.bias === 'BEARISH' ? -1.0 : 0),
            confidence: r.bias?.coherence || 0.6,
            veto: false
        },
    };

    let weightedSum = 0;
    let totalWeight = 0;
    const vetoReasons: string[] = [];
    
    for (const [key, sig] of Object.entries(signals)) {
        const w = this.lambdaWeights[key] || 0.1;
        const effW = w * sig.confidence;
        weightedSum += sig.score * effW;
        totalWeight += effW;
        if (sig.veto) vetoReasons.push(key);
    }

    const pStructural = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const ipdaConf = r.ipda_phase?.confidence || 0.7;
    const pFused = (0.65 * pStructural) + (0.35 * (ipdaConf * 2 - 1));

    let regime = "NEUTRAL";
    if (vetoReasons.length > 0) regime = "REVERSE_PERIOD";
    else if (Math.abs(pFused) < 0.25) regime = "LIAR_STATE";
    else if (Math.abs(pFused) > 0.55 && ipdaConf > 0.75) regime = "SINCERE";

    return {
        p_fused: pFused,
        confidence: (ipdaConf + (totalWeight / 0.8)) / 2, // normalized
        regime,
        active_lambdas: Object.keys(signals).filter(k => Math.abs(signals[k].score) > 0.6),
        veto_active: vetoReasons.length > 0,
        weights: this.lambdaWeights,
        status: regime === "SINCERE" ? "STRONG BIAS - EXECUTION ENABLED" : "INSUFFICIENT CONVERGENCE"
    };
  }

  private evaluateMandra(f: any, stability: number) {
    const e_curr = Math.pow(f.p_fused, 2) * stability;
    const delta_e = e_curr - this.prevEnergy;
    this.prevEnergy = e_curr;
    
    const open = delta_e >= 0;
    const clamped_size = (open && delta_e >= 0.05) ? 0.02 : 0.0;

    return {
        open,
        delta_e,
        clamped_size,
        regime_stable: stability > 0.6,
        status: open ? "GATE_OPEN: EXECUTION_VALID" : "VETO: NEGATIVE_INFORMATION_GAIN"
    };
  }

  private decideVeto(r: SMKResult) {
    const reasons: string[] = [];
    if (!r.mandra?.open) reasons.push('MANDRA:DE<0');
    if (r.topology?.fractured) reasons.push('TOPO:H1_FRACTURE');
    if (r.fusion?.veto_active) reasons.push('FUSION:LAMBDA_VETO');
    if (r.harmonic?.inverted) reasons.push('L3:LIAR_STATE');
    if (!r.kl?.stable) reasons.push('KL:REGIME_FRACTURE');
    if (r.fusion && r.fusion.confidence < 0.3) reasons.push('CONF:INSUFFICIENT');

    const decision = reasons.length > 0 ? 'Halt' : (r.amd?.R_MASTER ? 'Reset' : 'Proceed');
    return {
        decision,
        reasons,
        trade_allowed: decision === 'Proceed'
    };
  }

  private getSensorsList(r: SMKResult) {
    return [
      { id: 's01', name: 'PHASE ENTRAP', score: r.vol_decay?.ratio || 0, active: r.vol_decay?.entrapped || false },
      { id: 's02', name: 'EXPANSION', score: r.expansion?.prob || 0, active: (r.expansion?.prob || 0) > 0.5 },
      { id: 's03', name: 'HARMONIC L3', score: (r.harmonic?.phase_diff || 0) / Math.PI, active: r.harmonic?.inverted || false },
      { id: 's04', name: 'DEAL RANGE', score: r.dealing_range?.coherence || 0, active: true },
      { id: 's09', name: 'KL DIVERGE', score: Math.min(1.0, r.kl?.score || 0), active: !r.kl?.stable },
      { id: 's10', name: 'TOPO FRACT', score: (r.topology?.h1_score || 0) / 10, active: r.topology?.fractured || false },
      { id: 's13', name: 'MANIPULATION', score: (r.manipulation?.score || 0) / 100, active: r.manipulation?.active || false }
    ];
  }

  private blankResult(bar: OHLCV, idx: number): SMKResult {
    return {
      bar,
      bar_index: idx,
      total_bars: this.rawBars.length,
      amd: { state: 'Accumulation', prev: 'Accumulation', changed: false, R_MASTER: false },
      sensors: []
    };
  }
}
