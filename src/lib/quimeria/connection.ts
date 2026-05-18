import { QuimeriaClient } from "@/lib/quimeria/sdk";
import { useEffect, useState } from "react";
import { getLive, notifyLive } from "@/lib/live/store";
import { logLine } from "@/lib/live/console";

const LS_KEY = "quimeria.backendUrl";
const DEFAULT_BACKEND_URL = "https://mt.itimbre.com";

type ConnState = "disconnected" | "connecting" | "connected" | "error";

const listeners = new Set<() => void>();
let client: any = null;
let stream: any = null;
let state: ConnState = "disconnected";
let baseUrl =
  (typeof localStorage !== "undefined" && localStorage.getItem(LS_KEY)) ||
  DEFAULT_BACKEND_URL;
let lastError = "";

const emit = () => listeners.forEach((l) => l());

let _loggedFirstBar = false;

export function getBackendUrl() { return baseUrl; }
export function setBackendUrl(url: string) {
  baseUrl = url.trim().replace(/\/$/, "");
  try { localStorage.setItem(LS_KEY, baseUrl); } catch {}
  emit();
}

export function getConnState() { return state; }
export function getLastError() { return lastError; }

function pushEvent(text: string, kind: "event" | "veto" | "trade" = "event") {
  const live = getLive();
  const arr = kind === "veto" ? live.vetos : kind === "trade" ? live.trades : live.events;
  const t = Date.now();
  const d = new Date(t);
  const pad = (n: number) => n.toString().padStart(2, "0");
  arr.unshift({ t, kind, text: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}  ${text}` });
  if (arr.length > 40) arr.length = 40;
  notifyLive();
  // Mirror to Console panel
  const level = kind === "veto" ? "warn" : kind === "trade" ? "net" : "info";
  logLine(level as any, kind, text);
}

function applyBar(payload: any) {
  const live = getLive();
  if (!_loggedFirstBar) {
    _loggedFirstBar = true;
    try { logLine("net", "bar", `first frame keys: ${Object.keys(payload || {}).join(",")}`); } catch {}
  }
  // Accept either { bar: {...} } or a flat OHLC payload
  const bar = payload?.bar ?? payload;
  const close = typeof bar?.close === "number" ? bar.close
              : typeof bar?.c === "number" ? bar.c
              : undefined;
  if (typeof close === "number") {
    const tRaw = bar.time ?? bar.t ?? bar.timestamp;
    const t = tRaw ? (typeof tRaw === "number" ? tRaw : new Date(tRaw).getTime()) : Date.now();
    const c = close;
    const o = bar.open ?? bar.o ?? c;
    const h = bar.high ?? bar.h ?? c;
    const l = bar.low  ?? bar.l ?? c;
    if (!live.open) live.open = bar.open ?? c;
    if (!live.high) live.high = bar.high ?? c;
    if (!live.low) live.low = bar.low ?? c;
    live.price = c;
    live.bid = +(c - 0.0001).toFixed(5);
    live.ask = +(c + 0.0001).toFixed(5);
    live.high = Math.max(live.high, h);
    live.low  = Math.min(live.low,  l);
    live.changePct = +(((c - live.open) / live.open) * 100).toFixed(2);

    live.candles = [
      ...live.candles.slice(-79),
      { time: t, open: o, high: h, low: l, close: c, volume: 0 },
    ];
  }
  const idx = payload?.bar_index ?? payload?.index ?? bar?.index;
  if (typeof idx === "number") live.bar = idx;
  // AMD / regime
  if (payload?.amd?.changed) pushEvent(`AMD → ${payload.amd.state}`);
  // Lambdas → sensors (if present)
  const lam = payload?.lambdas;
  if (lam && typeof lam === "object") {
    live.sensors = live.sensors.map((s, i) => {
      const k = `l${i + 1}`;
      const v = (lam as any)[k];
      return typeof v === "number" ? { ...s, value: Math.max(0, Math.min(1, v)) } : s;
    });
  }
  notifyLive();
}

export async function connect(url?: string): Promise<void> {
  if (url) setBackendUrl(url);
  if (!baseUrl) { lastError = "No backend URL set"; state = "error"; emit(); return; }
  state = "connecting"; emit();
  try {
    client = new QuimeriaClient(baseUrl, { debug: false });
    await client.ping();
    logLine("info", "quimeria", `ping ok @ ${baseUrl}`);
    stream = client.stream;
    stream.onBar = applyBar;
    stream.onError = (m: string) => {
      pushEvent(`stream error: ${m}`, "veto");
      logLine("error", "stream", m);
    };
    stream.onOpen = () => {
      state = "connected"; emit();
      logLine("info", "stream", "WebSocket open");
    };
    stream.onClose = () => {
      if (state === "connected") { state = "disconnected"; emit(); }
      logLine("warn", "stream", "WebSocket closed");
    };
    stream.onOrder = (event: string, order: any) => {
      pushEvent(`${event} ${order?.side ?? ""} ${order?.lots ?? ""} @ ${order?.price ?? ""}`, "trade");
    };
    await stream.connect();
    state = "connected"; lastError = ""; emit();
  } catch (e: any) {
    lastError = e?.message ?? String(e);
    state = "error"; emit();
    logLine("error", "quimeria", `connect failed: ${lastError}`);
  }
}

export function disconnect() {
  try { stream?.disconnect(); } catch {}
  stream = null;
  state = "disconnected"; emit();
  logLine("info", "quimeria", "disconnected");
}

export async function loadSample() {
  logLine("net", "quimeria", "loading sample…");
  return client?.loadSample();
}
export async function streamRun(speed = 150) {
  logLine("info", "stream", `RUN @ ${speed}ms/bar`);
  return stream?.run({ speed });
}
export async function streamStop() {
  logLine("info", "stream", "STOP");
  return stream?.stop();
}
export async function streamReset() {
  logLine("info", "stream", "RESET");
  return stream?.reset();
}
export async function streamStep() {
  logLine("net", "stream", "STEP");
  return stream?.step();
}

export function getClient() { return client; }

export function useConnection() {
  const [snap, setSnap] = useState({ state, baseUrl, lastError });
  useEffect(() => {
    const l = () => setSnap({ state, baseUrl, lastError });
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return snap;
}
