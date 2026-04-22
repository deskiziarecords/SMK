export interface OHLCV {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SMKResult {
  bar: OHLCV;
  bar_index: number;
  total_bars: number;
  dealing_range?: {
    high: number;
    low: number;
    eq: number;
    zone: string;
    coherence: number;
    status: string;
  };
  bias?: {
    bias: string;
    eq: number;
    zone: string;
    coherence: number;
    valid: boolean;
  };
  ipda_phase?: {
    phase: string;
    eq: number;
    confidence: number;
    valid: boolean;
  };
  session?: {
    active: boolean;
    name: string;
    killzone: boolean;
    score: number;
    status: string;
  };
  swings?: {
    count: number;
    nodes: Array<{ idx: number; price: number; type: string }>;
  };
  fvg?: {
    count: number;
    active: boolean;
    recent: Array<{ type: string; top: number; bot: number; eq: number }>;
  };
  ob?: {
    count: number;
    active: boolean;
    recent: Array<{ type: string; level: number; high: number; low: number; score: number }>;
  };
  vol_decay?: {
    ratio: number;
    entrapped: boolean;
    energy: number;
    stasis: number;
    status: string;
  };
  displacement?: {
    is_disp: boolean;
    dir: number;
    body_ratio: number;
    vetoed: boolean;
    status: string;
  };
  harmonic?: {
    phase_diff: number;
    inverted: boolean;
    trap: string;
    status: string;
  };
  expansion?: {
    prob: number;
    entrapped: boolean;
    target: number;
    status: string;
  };
  manipulation?: {
    active: boolean;
    score: number;
    level: string;
    wick: number;
    status: string;
  };
  kl?: {
    score: number;
    stable: boolean;
    status: string;
  };
  topology?: {
    h1_score: number;
    fractured: boolean;
    islands: number;
    status: string;
  };
  causality?: {
    granger: { f_stat: number; p_val: number; significant: boolean; conf: number; lag: number };
    transfer: { flow: number; threshold: number; significant: boolean };
    ccm: { rho: number; convergent: boolean };
    spearman: { rho: number; lag: number; significant: boolean };
  };
  amd?: {
    state: string;
    prev: string;
    changed: boolean;
    R_MASTER: boolean;
  };
  fusion?: {
    p_fused: number;
    confidence: number;
    regime: string;
    active_lambdas: string[];
    veto_active: boolean;
    weights: Record<string, number>;
    status: string;
  };
  mandra?: {
    open: boolean;
    delta_e: number;
    clamped_size: number;
    regime_stable: boolean;
    status: string;
  };
  veto?: {
    decision: string;
    reasons: string[];
    trade_allowed: boolean;
  };
  smart?: {
    sequence: string;
    entropy: number;
    energy: number;
    curl: number;
    divergence: number;
    delta: number;
    symbol: string;
  };
  execution?: {
    action: string;
    reason: string;
    is_armed: boolean;
    pattern: string;
    direction: number;
    stop_loss_price: number;
    take_profit_price: number;
    lot_size: number;
    risk_pips: number;
  };
  sensors?: Array<{ id: string; name: string; score: number; active: boolean }>;
}
