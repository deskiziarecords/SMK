import type { BaseClient } from "../client.js";
import type { PingResponse, StatusResponse } from "../types/index.js";

export class CoreApi {
  constructor(private readonly c: BaseClient) {}

  /** GET /api/ping — lightweight health check used by the launcher */
  ping(): Promise<PingResponse> {
    return this.c.get("/api/ping");
  }

  /** GET /api/status — global status + module map */
  status(): Promise<StatusResponse> {
    return this.c.get("/api/status");
  }

  /** GET /api/logs — list available log files */
  logs(): Promise<string[]> {
    return this.c.get("/api/logs");
  }

  /** GET /api/logs/:filename — fetch contents of a specific log file */
  logFile(filename: string): Promise<string> {
    return this.c.get(`/api/logs/${filename}`);
  }

  /** GET /api/plugins — list all registered plugins and their enabled state */
  plugins(): Promise<Array<{ name: string; enabled: boolean; description?: string }>> {
    return this.c.get("/api/plugins");
  }

  /** POST /api/plugins/toggle — enable or disable a plugin by name */
  togglePlugin(name: string, enabled: boolean): Promise<{ name: string; enabled: boolean }> {
    return this.c.post("/api/plugins/toggle", { name, enabled });
  }

  /** POST /api/config/modules — update module configuration */
  configureModules(config: Record<string, unknown>): Promise<{ applied: Record<string, unknown> }> {
    return this.c.post("/api/config/modules", config);
  }

  /** GET /api/bitget/ping — check Bitget connectivity */
  bitgetPing(): Promise<{ connected: boolean; latency_ms?: number }> {
    return this.c.get("/api/bitget/ping");
  }

  /** POST /api/load/csv — load OHLCV data from CSV (multipart form, use fetch directly for binary) */
  loadSample(): Promise<{ bars_loaded: number; symbol: string }> {
    return this.c.post("/api/load/sample");
  }
}
