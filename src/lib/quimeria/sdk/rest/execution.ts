import type { BaseClient } from "../client.js";
import type { ExecutionConfig, ExecutionStatus, ExecutionStats } from "../types/index.js";

export class ExecutionApi {
  constructor(private readonly c: BaseClient) {}

  /** POST /api/execution/configure — set execution mode (LIVE / PAPER / DRY_RUN) and limits */
  configure(config: Partial<ExecutionConfig>): Promise<ExecutionConfig> {
    return this.c.post("/api/execution/configure", config);
  }

  /** GET /api/execution/status — current mode, open positions, daily PnL, halt state */
  status(): Promise<ExecutionStatus> {
    return this.c.get("/api/execution/status");
  }

  /** GET /api/execution/stats — cumulative trade statistics since last reset */
  stats(): Promise<ExecutionStats> {
    return this.c.get("/api/execution/stats");
  }
}
