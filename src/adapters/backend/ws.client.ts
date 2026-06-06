// Cliente WebSocket único para o backend NestJS.
// Roteia eventos: signal:new, bot4x:update, copilot:message, price:update.
import { authAdapter } from "./auth.adapter";

type Handler = (payload: unknown) => void;

export type WsEvent =
  | "signal:new"
  | "signal:update"
  | "bot4x:update"
  | "copilot:message"
  | "price:update"
  | string;

const WS_URL =
  (typeof window !== "undefined" && (import.meta as any).env?.VITE_API_WS_URL) ||
  "ws://localhost:3001";

class BackendWsClient {
  private socket: WebSocket | null = null;
  private handlers = new Map<WsEvent, Set<Handler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connecting = false;

  async connect(path = "/ws") {
    if (this.socket && this.socket.readyState <= 1) return;
    if (this.connecting) return;
    this.connecting = true;

    const token = await authAdapter.getAccessToken();
    const url = `${WS_URL}${path}${token ? `?token=${token}` : ""}`;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      this.connecting = false;
    };
    ws.onclose = () => {
      this.connecting = false;
      this.socket = null;
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.connect(path), 3000);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        const event: WsEvent = data?.event ?? data?.type;
        if (!event) return;
        const set = this.handlers.get(event);
        set?.forEach((h) => h(data?.payload ?? data));
      } catch {
        /* ignore */
      }
    };

    this.socket = ws;
  }

  on(event: WsEvent, handler: Handler): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  send(event: WsEvent, payload: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ event, payload }));
    }
  }

  close() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
  }
}

export const backendWs = new BackendWsClient();
