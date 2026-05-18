import type { BaseClient } from "../client.js";
import type {
  ActionMode,
  QueuedSignal,
  ApprovalRequest,
  RejectionRequest,
  ActionStats,
} from "../types/index.js";

export class ActionApi {
  constructor(private readonly c: BaseClient) {}

  /** GET /api/action/mode — current action center mode */
  mode(): Promise<{ mode: ActionMode }> {
    return this.c.get("/api/action/mode");
  }

  /** POST /api/action/mode — switch action center mode */
  setMode(mode: ActionMode): Promise<{ mode: ActionMode }> {
    return this.c.post("/api/action/mode", { mode });
  }

  /** GET /api/action/queue — list pending signals awaiting manual approval */
  queue(): Promise<QueuedSignal[]> {
    return this.c.get("/api/action/queue");
  }

  /** POST /api/action/queue/:id/approve — approve a queued signal */
  approve(signalId: string, req: ApprovalRequest = {}): Promise<{ status: "approved" }> {
    return this.c.post(`/api/action/queue/${signalId}/approve`, req);
  }

  /** POST /api/action/queue/:id/reject — reject a queued signal */
  reject(signalId: string, req: RejectionRequest = {}): Promise<{ status: "rejected" }> {
    return this.c.post(`/api/action/queue/${signalId}/reject`, req);
  }

  /** GET /api/action/history — action center decision history */
  history(limit = 100): Promise<QueuedSignal[]> {
    return this.c.get("/api/action/history", { limit });
  }

  /** GET /api/action/stats — aggregate approval/rejection/auto-execution counters */
  stats(): Promise<ActionStats> {
    return this.c.get("/api/action/stats");
  }
}
