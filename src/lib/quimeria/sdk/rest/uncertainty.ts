import type { BaseClient } from "../client.js";
import type {
  UncertaintyResult,
  SobolRanking,
  VaRResult,
} from "../types/index.js";

export class UncertaintyApi {
  constructor(private readonly c: BaseClient) {}

  /** GET /api/uncertainty/last — most recent UQPCE uncertainty estimate */
  last(): Promise<UncertaintyResult> {
    return this.c.get("/api/uncertainty/last");
  }

  /** GET /api/uncertainty/sobol — Sobol sensitivity ranking of input features */
  sobol(): Promise<SobolRanking> {
    return this.c.get("/api/uncertainty/sobol");
  }

  /** GET /api/uncertainty/var — Value at Risk (95% and 99%) */
  var(): Promise<VaRResult> {
    return this.c.get("/api/uncertainty/var");
  }

  /** GET /api/uncertainty/history — historical uncertainty estimates (default last 100) */
  history(limit = 100): Promise<UncertaintyResult[]> {
    return this.c.get("/api/uncertainty/history", { limit });
  }

  /** POST /api/uncertainty/pce-order — update PCE expansion order */
  setPceOrder(order: number): Promise<{ pce_order: number }> {
    return this.c.post("/api/uncertainty/pce-order", { order });
  }
}
