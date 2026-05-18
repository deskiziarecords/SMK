// src/lib/live/store.ts

import { OHLCV } from "@/types/smk";

interface LiveState {
  price: number;
  bid: number;
  ask: number;
  open: number;
  high: number;
  low: number;
  changePct: number;
  candles: OHLCV[];
  bar: number;
  vetos: any[];
  trades: any[];
  events: any[];
  sensors: any[];
}

const state: LiveState = {
  price: 0,
  bid: 0,
  ask: 0,
  open: 0,
  high: 0,
  low: 1e9,
  changePct: 0,
  candles: [],
  bar: 0,
  vetos: [],
  trades: [],
  events: [],
  sensors: [
    { id: 's1', name: 'Momentum', value: 0 },
    { id: 's2', name: 'Volatility', value: 0 },
    { id: 's3', name: 'Volume Profile', value: 0 },
    { id: 's4', name: 'Order Flow', value: 0 },
  ],
};

const listeners = new Set<() => void>();

export function getLive() {
  return state;
}

export function notifyLive() {
  listeners.forEach((l) => l());
}

export function subscribeLive(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
