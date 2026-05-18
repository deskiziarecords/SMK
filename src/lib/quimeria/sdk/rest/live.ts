import type { BaseClient } from "../client.js";
import type { LiveFeedStatus } from "../types/index.js";

export class LiveApi {
  constructor(private readonly c: BaseClient) {}

  /** POST /api/live/start — start the Bitget live feed worker */
  start(symbol?: string): Promise<{ started: boolean; symbol: string }> {
    return this.c.post("/api/live/start", symbol ? { symbol } : undefined);
  }

  /** POST /api/live/stop — stop the live feed worker */
  stop(): Promise<{ stopped: boolean }> {
    return this.c.post("/api/live/stop");
  }

  /** GET /api/live/status — live feed connection state, last price, message count */
  status(): Promise<LiveFeedStatus> {
    return this.c.get("/api/live/status");
  }
}
