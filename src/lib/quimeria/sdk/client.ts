// src/lib/quimeria/sdk/client.ts

export class QuimeriaError extends Error {
  constructor(public message: string, public status?: number) {
    super(message);
    this.name = "QuimeriaError";
  }
}

export class BaseClient {
  constructor(protected readonly baseUrl: string, protected readonly options: { debug?: boolean } = {}) {}

  protected async request<T>(path: string, method: string, body?: any): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    if (this.options.debug) {
      console.log(`[Quimeria] ${method} ${url}`, body || "");
    }

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        throw new QuimeriaError(`Request failed: ${response.statusText}`, response.status);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof QuimeriaError) throw error;
      throw new QuimeriaError(error instanceof Error ? error.message : String(error));
    }
  }

  get<T>(path: string, params?: Record<string, any>): Promise<T> {
    let url = path;
    if (params) {
      const qs = new URLSearchParams(params as any).toString();
      if (qs) url += `?${qs}`;
    }
    return this.request<T>(url, "GET");
  }

  post<T>(path: string, body?: any): Promise<T> {
    return this.request<T>(path, "POST", body);
  }
}
