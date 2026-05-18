import type { BaseClient } from "../client.js";
import type {
  KellyParams,
  KellyCalcRequest,
  KellyCalcResult,
  KellyUpdateRequest,
} from "../types/index.js";

export class SizingApi {
  constructor(private readonly c: BaseClient) {}

  /** GET /api/sizing/kelly/params — current Kelly prior parameters */
  kellyParams(): Promise<KellyParams> {
    return this.c.get("/api/sizing/kelly/params");
  }

  /** POST /api/sizing/kelly/calculate — compute Kelly fraction for a given trade setup */
  kellyCalculate(req: KellyCalcRequest): Promise<KellyCalcResult> {
    return this.c.post("/api/sizing/kelly/calculate", req);
  }

  /** POST /api/sizing/kelly/update — update Bayesian priors after a closed trade */
  kellyUpdate(req: KellyUpdateRequest): Promise<KellyParams> {
    return this.c.post("/api/sizing/kelly/update", req);
  }
}
