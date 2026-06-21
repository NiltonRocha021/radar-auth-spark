// Cliente WebSocket único para o backend NestJS.
// Roteia eventos: signal:new, bot4x:update, copilot:message, price:update.
// Exige token JWT do usuário autenticado (Supabase) — sem token, não conecta.
import { authAdapter } from "./auth.adapter";

type Handler = (payload: unknown) => void;
type StatusHandler = (status: WsStatus) => void;

export type WsStatus =
  | "idle"
  | "connecting"
  | "open"
  | "closed"
  | "unauthenticated"
  | "error";

export type WsEvent =
  | "signal:new"
  | "signal:update"
  | "bot4x:update"
  | "copilot:message"
  | "calibrator:state"
  | "price:update"
  | string;


const WS_URL =
  (typeof window !== "undefined" && (import.meta as any).env?.VITE_API_WS_URL) ||
  "ws://localhost:3001";

class BackendWsClient {
  private socket: WebSocket | null = null;
  private handlers = new Map<WsEvent, Set<Handler>>();
  private statusHandlers = new Set<StatusHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connecting = false;
  private currentPath = "/ws";
  private status: WsStatus = "idle";

  getStatus(): WsStatus {
    return this.status;
  }

  isAuthenticatedOpen(): boolean {
    return this.status === "open" && this.socket?.readyState === WebSocket.OPEN;
  }

  private setStatus(s: WsStatus) {
    this.status = s;
    this.statusHandlers.forEach((h) => h(s));
  }

  async connect(path = "/ws"): Promise<WsStatus> {
    this.currentPath = path;
    if (this.socket && this.socket.readyState <= 1) return this.status;
    if (this.connecting) return this.status;

    const token = await authAdapter.getAccessToken();
    if (!token) {
      this.setStatus("unauthenticated");
      // Não agendar reconexão automática — esperar o app autenticar e chamar connect() de novo
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      return this.status;
    }

    this.connecting = true;
    this.setStatus("connecting");

    const url = `${WS_URL}${path}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.connecting = false;
      this.setStatus("error");
      this.scheduleReconnect();
      return this.status;
    }

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", token }));
      this.connecting = false;
      this.setStatus("open");
    };
    ws.onclose = (ev) => {
      this.connecting = false;
      this.socket = null;
      // 4401 / 1008 → encerrar sem reconectar; provavelmente token inválido
      if (ev.code === 4401 || ev.code === 1008) {
        this.setStatus("unauthenticated");
        return;
      }
      this.setStatus("closed");
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      this.setStatus("error");
      ws.close();
    };
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
    return this.status;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(this.currentPath), 3000);
  }

  on(event: WsEvent, handler: Handler): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    handler(this.status);
    return () => this.statusHandlers.delete(handler);
  }

  send(event: WsEvent, payload: unknown): boolean {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ event, payload }));
      return true;
    }
    return false;
  }

  close() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
    this.setStatus("closed");
  }
}

export const backendWs = new BackendWsClient();
