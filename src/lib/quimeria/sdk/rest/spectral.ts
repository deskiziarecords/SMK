import type { BaseClient } from "../client.js";
import type { SpectralBand, FHTState } from "../types/index.js";

export class SpectralApi {
  constructor(private readonly c: BaseClient) {}

  /** GET /api/spectral/bands — all FHT frequency bands with temperature + status */
  bands(): Promise<SpectralBand[]> {
    return this.c.get("/api/spectral/bands");
  }

  /** GET /api/spectral/band/:name — single band by name */
  band(name: string): Promise<SpectralBand> {
    return this.c.get(`/api/spectral/band/${name}`);
  }

  /** GET /api/spectral/fht — current FHT consciousness state */
  fht(): Promise<FHTState> {
    return this.c.get("/api/spectral/fht");
  }

  /** GET /api/spectral/fht/history — FHT history (default last 500 bars) */
  fhtHistory(limit = 500): Promise<FHTState[]> {
    return this.c.get("/api/spectral/fht/history", { limit });
  }

  /** POST /api/spectral/fht/threshold — update consciousness threshold (default 0.7) */
  setThreshold(threshold: number): Promise<{ threshold: number }> {
    return this.c.post("/api/spectral/fht/threshold", { threshold });
  }
}
