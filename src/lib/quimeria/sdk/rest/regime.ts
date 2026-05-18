import type { BaseClient } from "../client.js";
import type { SMCPosterior, SMCPersistence, SMCObservation } from "../types/index.js";

export class RegimeApi {
  constructor(private readonly c: BaseClient) {}

  /** GET /api/regime/smc/posterior — current HMM regime probabilities */
  posterior(): Promise<SMCPosterior> {
    return this.c.get("/api/regime/smc/posterior");
  }

  /** POST /api/regime/smc/update — inject a new observation into the SMC filter */
  update(obs: SMCObservation): Promise<SMCPosterior> {
    return this.c.post("/api/regime/smc/update", obs);
  }

  /** GET /api/regime/smc/persistence — how long current regime has been active */
  persistence(): Promise<SMCPersistence> {
    return this.c.get("/api/regime/smc/persistence");
  }
}
