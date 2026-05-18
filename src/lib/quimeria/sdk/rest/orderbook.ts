import type { BaseClient } from "../client.js";
import type {
  OrderbookStatus,
  QuoteRequest,
  QuoteResponse,
  OrderRequest,
  OrderResponse,
} from "../types/index.js";

export class OrderbookApi {
  constructor(private readonly c: BaseClient) {}

  /** GET /api/orderbook/status — Hyperion LOB liquidity, depth, imbalance, spoofing */
  status(): Promise<OrderbookStatus> {
    return this.c.get("/api/orderbook/status");
  }

  /** POST /api/orderbook/quote — get an executable quote for a hypothetical order */
  quote(req: QuoteRequest): Promise<QuoteResponse> {
    return this.c.post("/api/orderbook/quote", req);
  }

  /** POST /api/orderbook/order — submit an order through Hyperion */
  submitOrder(req: OrderRequest): Promise<OrderResponse> {
    return this.c.post("/api/orderbook/order", req);
  }

  /** POST /api/orderbook/close — close a position by symbol */
  closePosition(symbol: string): Promise<OrderResponse> {
    return this.c.post("/api/orderbook/close", { symbol });
  }
}