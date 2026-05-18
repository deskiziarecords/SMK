// src/lib/live/console.ts

export type LogLevel = "info" | "warn" | "error" | "net" | "quimeria" | "stream" | "trade";

export function logLine(level: LogLevel, category: string, message: string) {
  console.log(`[${category.toUpperCase()}] (${level}) ${message}`);
}
