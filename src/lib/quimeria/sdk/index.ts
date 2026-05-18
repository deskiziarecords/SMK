// src/lib/quimeria/sdk/index.ts

export * from "./types/index.js";
export { QuimeriaError } from "./client.js";
export type { StreamOptions } from "./streams/base.js";

import { BaseClient } from "./client.js";
import { StreamManager } from "./streams/index.js";

import { CoreApi } from "./rest/core.js";
import { SignalApi, SystemApi } from "./rest/signal.js";
import { RegimeApi } from "./rest/regime.js";
import { UncertaintyApi } from "./rest/uncertainty.js";
import { SizingApi } from "./rest/sizing.js";
import { ActionApi } from "./rest/action.js";
import { ForensicApi } from "./rest/forensic.js";
import { SpectralApi } from "./rest/spectral.js";
import { OrderbookApi } from "./rest/orderbook.js";
import { ExecutionApi } from "./rest/execution.js";
import { LiveApi } from "./rest/live.js";

import type { QuimeriaClientOptions, PingResponse, StatusResponse } from "./types/index.js";

export class QuimeriaClient {
  private readonly client: BaseClient;

  /** Health check + utility endpoints (ping, status, logs, plugins) */
  readonly core: CoreApi;
  /** Signal pipeline: latest() and push() */
  readonly sig: SignalApi;
  readonly system: SystemApi;
  /** Regime detection and manifold stability */
  readonly regime: RegimeApi;
  /** Entropy and Uncertainty metrics */
  readonly uncertainty: UncertaintyApi;
  /** Kelly and sizing calculations */
  readonly sizing: SizingApi;
  /** Action / Order routing logic */
  readonly actions: ActionApi;
  /** Forensic Market plugins */
  readonly forensic: ForensicApi;
  /** Spectral λ-decay analysis */
  readonly spectral: SpectralApi;
  /** Orderbook depth and imbalance */
  readonly orderbook: OrderbookApi;
  /** Aegis Execution & Bridge status */
  readonly execution: ExecutionApi;
  /** Live Bitget feeds */
  readonly live: LiveApi;

  /** WebSocket stream manager */
  readonly stream: StreamManager;

  constructor(baseUrl: string, options: QuimeriaClientOptions = {}) {
    this.client = new BaseClient(baseUrl, options);
    
    this.core = new CoreApi(this.client);
    this.sig = new SignalApi(this.client);
    this.system = new SystemApi(this.client);
    this.regime = new RegimeApi(this.client);
    this.uncertainty = new UncertaintyApi(this.client);
    this.sizing = new SizingApi(this.client);
    this.actions = new ActionApi(this.client);
    this.forensic = new ForensicApi(this.client);
    this.spectral = new SpectralApi(this.client);
    this.orderbook = new OrderbookApi(this.client);
    this.execution = new ExecutionApi(this.client);
    this.live = new LiveApi(this.client);

    this.stream = new StreamManager(baseUrl);
  }

  /** Quick ping alias */
  ping(): Promise<PingResponse> {
    return this.core.ping();
  }

  /** Quick status alias */
  status(): Promise<StatusResponse> {
    return this.core.status();
  }

  /** Load synthetic sample alias */
  loadSample(): Promise<{ bars_loaded: number; symbol: string }> {
    return this.core.loadSample();
  }
}
