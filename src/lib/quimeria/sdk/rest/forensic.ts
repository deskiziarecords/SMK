import type { BaseClient } from "../client.js";
import type { SeismicReading, ChatRequest, ChatResponse } from "../types/index.js";

export class ForensicApi {
  constructor(private readonly c: BaseClient) {}

  /** GET /api/forensic/seismic — latest seismic anomaly reading from the forensic plugins */
  seismic(): Promise<SeismicReading> {
    return this.c.get("/api/forensic/seismic");
  }

  /** POST /api/forensic/chat — natural-language query against the forensic context */
  chat(req: ChatRequest): Promise<ChatResponse> {
    return this.c.post("/api/forensic/chat", req);
  }
}
