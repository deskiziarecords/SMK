import type { BaseClient } from "../client.js";
import type { Bar, SignalResult, SystemStatusResponse } from "../types/index.js";

export class SignalApi {
  constructor(private readonly c: BaseClient) {}

  /** GET /api/signals/latest — most recent signal from the pipeline */
  latest(): Promise<SignalResult> {
    return this.c.get("/api/signals/latest");
  }

  /** POST /api/signals/on_new_bar — push a candle into the pipeline and trigger processing */
  push(candle: Bar): Promise<{ status: "ok" }> {
    return this.c.post("/api/signals/on_new_bar", candle);
  }
}

export class SystemApi {
  constructor(private readonly c: BaseClient) {}

  /** GET /api/system/status — v1.1 system status: kernel readiness, modules loaded, import errors */
  status(): Promise<SystemStatusResponse> {
    return this.c.get("/api/system/status");
  }
}
