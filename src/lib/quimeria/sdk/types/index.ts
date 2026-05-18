// src/lib/quimeria/sdk/types/index.ts

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SignalResult {
  [key: string]: any;
}

export interface StatusResponse {
  modules: Record<string, any>;
  bars_loaded: number;
  cursor: number;
  [key: string]: any;
}

export interface SystemStatusResponse extends StatusResponse {}

export interface PingResponse {
  status: string;
  pipeline_ready: boolean;
}

export interface QuimeriaClientOptions {
  debug?: boolean;
}

export interface StreamOptions {
  speed?: number;
}

export interface SignalResponse {
  [key: string]: any;
}

export interface OrderbookResponse {
  bid: number;
  ask: number;
  spread_bps: number;
  imbalance: number;
  liquid: boolean;
  spoofing_detected: boolean;
}

export interface OrderbookStatus {
  [key: string]: any;
}

export interface QuoteRequest {
  symbol: string;
  price: number;
}

export interface QuoteResponse {
  status: string;
}

export interface OrderRequest {
  symbol: string;
  side: string;
  lots: number;
  price?: number;
  venue?: string;
}

export interface OrderResponse {
  order_id: string;
  status: string;
  [key: string]: any;
}

export interface ExecutionStatus {
  slm_available: boolean;
  aegis_available: boolean;
  enabled: boolean;
  capital: number;
}

export interface ExecutionConfig {
  capital?: number;
  riskPerTrade?: number;
  nVenues?: number;
  kellyLimit?: number;
  enabled?: boolean;
}

export interface ExecutionStats {
  [key: string]: any;
}

export interface ActionMode {
  [key: string]: any;
}

export interface QueuedSignal {
  [key: string]: any;
}

export interface ApprovalRequest {
  id?: string;
}

export interface RejectionRequest {
  id?: string;
}

export interface ActionStats {
  [key: string]: any;
}

export interface SeismicReading {
  [key: string]: any;
}

export interface ChatRequest {
  message: string;
  context?: any;
}

export interface ChatResponse {
  response: string;
}

export interface LiveFeedStatus {
  [key: string]: any;
}

export interface SMCPosterior {
  [key: string]: any;
}

export interface SMCPersistence {
  [key: string]: any;
}

export interface SMCObservation {
  [key: string]: any;
}

export interface KellyParams {
  [key: string]: any;
}

export interface KellyCalcRequest {
  [key: string]: any;
}

export interface KellyCalcResult {
  [key: string]: any;
}

export interface KellyUpdateRequest {
  [key: string]: any;
}

export interface SpectralBand {
  [key: string]: any;
}

export interface FHTState {
  [key: string]: any;
}

export interface UncertaintyResult {
  [key: string]: any;
}

export interface SobolRanking {
  [key: string]: any;
}

export interface VaRResult {
  [key: string]: any;
}
