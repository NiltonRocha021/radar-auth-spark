import { useEffect, useRef, useState, useCallback } from "react";

export type OrbState = "idle" | "listening" | "thinking" | "speaking" | "alert";
export type MessageRole = "user" | "assistant" | "alert" | "system";

export interface CopilotMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  agent?: string;
  metadata?: Record<string, unknown>;
}

export interface MarketContext {
  asset?: string;
  price?: number;
  regime?: "BULLISH" | "BEARISH" | "NEUTRAL" | "VOLATILE";
  aiScore?: number;
  volatility?: number;
  riskScore?: number;
  liquidityScore?: number;
  manipulationScore?: number;

  priceActionScore?: number;
  indicatorsScore?: number;
  flowScore?: number;
  sentimentScore?: number;
  aiPredictiveScore?: number;
  macroScore?: number;

  bot4xActive?: boolean;
  bot4xProfile?: "conservador" | "calibradoRSI" | "calibradoAiScore" | "agressivo";
  bot4xDailyPnl?: number;
  bot4xOpenSlots?: number;
  bot4xCircuitBreaker?: "none" | "emergency" | "profitLock";

  activeSignals?: number;
  topSignalScore?: number;
  topSignalAsset?: string;
  topSignalDirection?: "BUY" | "SELL";
}

export interface TraderProfile {
  name?: string;
  style?: "conservative" | "moderate" | "aggressive";
  operationsToday?: number;
  drawdownToday?: number;
  bestSession?: string;

  dnaConsistency?: number;
  dnaDiscipline?: number;
  dnaRiskControl?: number;
  dnaTiming?: number;
  dnaEmotionalControl?: number;
  overtradingRisk?: boolean;
  worstDayOfWeek?: string;
  worstSession?: string;
  avgWinRate?: number;
  planTier?: "starter" | "pro" | "institutional";
}

export interface CopilotConfig {
  userId: string;
  token: string;
  wsUrl?: string;
  marketContext?: MarketContext;
  traderProfile?: TraderProfile;
  onAlert?: (msg: CopilotMessage) => void;
}

// CORREÇÃO: remover (import.meta as any) — import.meta.env é tipado via vite/client.
// Forçar wss:// em produção, igual ao ws-client.ts, para não transmitir JWT sem TLS.
function resolveCopilotWsUrl(override?: string): string {
  if (override) return override;
  const envUrl = import.meta.env.VITE_API_WS_URL;
  if (envUrl) return envUrl;
  if (import.meta.env.PROD) {
    console.error(
      "[Copilot] VITE_API_WS_URL não definida em produção. " +
        "Defina a variável de ambiente para habilitar WebSocket seguro (wss://).",
    );
    return "";
  }
  return "ws://localhost:3001";
}

export function useCopilot(config: CopilotConfig) {
  const { userId, token, wsUrl, marketContext = {}, traderProfile = {}, onAlert } = config;

  const socketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [latency, setLatency] = useState<number>(0);

  function buildMessage(role: MessageRole, content: string, extras: Partial<CopilotMessage> = {}): CopilotMessage {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      role,
      content,
      timestamp: new Date(),
      ...extras,
    };
  }

  function addMessage(msg: CopilotMessage) {
    setMessages((prev) => [...prev, msg]);
  }

  function playAudio(base64: string) {
    const audio = new Audio(`data:audio/mpeg;base64,${base64}`);
    setOrbState("speaking");
    audio.onended = () => setOrbState("idle");
    audio.play().catch(() => setOrbState("idle"));
  }

  const connect = useCallback(() => {
    const resolvedUrl = resolveCopilotWsUrl(wsUrl);
    if (!resolvedUrl) {
      // Sem URL em produção — não conectar sem TLS
      return;
    }

    // SEGURANÇA: JWT nunca vai na URL (fica em logs de servidor/proxies).
    // Enviamos o token no primeiro frame após a conexão abrir (mensagem "auth").
    const ws = new WebSocket(`${resolvedUrl}/copilot`);

    ws.onopen = () => {
      setIsConnected(true);
      // Token enviado no primeiro frame — nunca na URL onde ficaria em logs.
      ws.send(JSON.stringify({ type: "auth", token }));
      ws.send(JSON.stringify({ type: "init", userId, marketContext, traderProfile }));
    };


    ws.onclose = () => {
      setIsConnected(false);
      setOrbState("idle");
      reconnectTimerRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleServerMessage(data);
      } catch {
        /* ignore */
      }
    };

    socketRef.current = ws;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, token, wsUrl]);

  useEffect(() => {
    connect();
    return () => {
      socketRef.current?.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [connect]);

  function handleServerMessage(data: Record<string, unknown>) {
    switch (data.type) {
      case "thinking":
        setOrbState("thinking");
        break;
      case "chat_response": {
        addMessage(
          buildMessage("assistant", data.text as string, { metadata: data.metadata as Record<string, unknown> }),
        );
        setOrbState("idle");
        if (data.latency) setLatency(data.latency as number);
        break;
      }
      case "voice_response": {
        addMessage(
          buildMessage("assistant", data.text as string, { metadata: data.metadata as Record<string, unknown> }),
        );
        if (data.audio_base64) playAudio(data.audio_base64 as string);
        setOrbState("idle");
        break;
      }
      case "transcript":
        addMessage(buildMessage("user", data.text as string));
        setOrbState("thinking");
        break;
      case "proactive_alert": {
        const alert = buildMessage("alert", data.content as string, { agent: data.agent as string });
        addMessage(alert);
        setOrbState("alert");
        onAlert?.(alert);
        setTimeout(() => setOrbState("idle"), 4000);
        break;
      }
      case "system_message":
        addMessage(buildMessage("system", data.content as string));
        break;
    }
  }

  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim() || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
      addMessage(buildMessage("user", text));
      setOrbState("thinking");
      socketRef.current.send(
        JSON.stringify({
          type: "chat_message",
          userId,
          message: text,
          context: { market: marketContext, trader: traderProfile },
        }),
      );
    },
    [userId, marketContext, traderProfile],
  );

  function sendVoice(blob: Blob, mimeType: string) {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      socketRef.current!.send(
        JSON.stringify({
          type: "voice_input",
          userId,
          audio_base64: base64,
          mime_type: mimeType,
          context: { market: marketContext, trader: traderProfile },
        }),
      );
    };
    reader.readAsDataURL(blob);
  }

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
        stream.getTracks().forEach((t) => t.stop());
        sendVoice(blob, recorder.mimeType);
      };
      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setOrbState("listening");
    } catch (err) {
      console.error("[Copilot] Microphone denied", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    setOrbState("thinking");
  }, []);

  function clearHistory() {
    setMessages([]);
  }

  return {
    messages,
    orbState,
    isConnected,
    isRecording,
    latency,
    sendMessage,
    startRecording,
    stopRecording,
    clearHistory,
  };
}
