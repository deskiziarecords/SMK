// src/lib/quimeria/sdk/streams/index.ts

import type { StreamOptions } from "./base.js";

export class StreamManager {
  private ws: WebSocket | null = null;
  public onBar: ((data: any) => void) | null = null;
  public onDone: (() => void) | null = null;
  public onError: ((msg: string) => void) | null = null;
  public onOrder: ((event: string, order: any) => void) | null = null;
  public onOpen: (() => void) | null = null;
  public onClose: (() => void) | null = null;

  constructor(private readonly baseUrl: string) {}

  private get wsUrl(): string {
    const url = new URL(this.baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(`${this.wsUrl}/ws/stream`);
        this.ws.onopen = () => {
          this.onOpen?.();
          resolve();
        };
        this.ws.onmessage = (event) => {
          const msg = JSON.parse(event.data);
          if (msg.type === "bar") this.onBar?.(msg.data);
          else if (msg.type === "done") this.onDone?.();
          else if (msg.type === "order") this.onOrder?.(msg.event, msg.order);
        };
        this.ws.onerror = (err) => {
          this.onError?.("WebSocket error");
          reject(err);
        };
        this.ws.onclose = () => this.onClose?.();
      } catch (err) {
        reject(err);
      }
    });
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }

  async run(options: StreamOptions = {}): Promise<void> {
    this.send({ action: "run", ...options });
  }

  async stop(): Promise<void> {
    this.send({ action: "stop" });
  }

  async step(): Promise<void> {
    this.send({ action: "step" });
  }

  async reset(): Promise<void> {
    this.send({ action: "reset" });
  }

  private send(msg: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}
