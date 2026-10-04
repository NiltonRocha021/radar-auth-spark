// Fase 6 — Copilot 100% dentro do TanStack Start.
// O WebSocket do NestJS (`backendWs` canal "copilot") foi substituído por
// streaming HTTP contra a server route `/api/copilot/chat`, que fala com o
// Lovable AI Gateway. Sem localhost:3001, sem ws-client, sem copilot.adapter.
//
// Histórico continua persistido em `copilot_history` (RLS + TTL 90 dias).
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

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
  /** Opcional — o token é obtido pelo backendWs via Supabase. */
  token?: string;
  /** @deprecated A URL é configurada via VITE_API_WS_URL no backendWs. */
  wsUrl?: string;
  marketContext?: MarketContext;
  traderProfile?: TraderProfile;
  onAlert?: (msg: CopilotMessage) => void;
}

function newMsg(role: MessageRole, content: string, extras: Partial<CopilotMessage> = {}): CopilotMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    timestamp: new Date(),
    ...extras,
  };
}

// ─── Persistência de histórico ──────────────────────────────────────────────
// Persiste apenas mensagens "user" e "assistant" — mensagens de sistema e
// alertas são efêmeras (não fazem sentido fora da sessão).
// Rate-limit: a RLS da tabela rejeita acima de 60 inserts/min — não é
// necessário debounce adicional no frontend além do que já acontece naturalmente.
const PERSIST_ROLES: MessageRole[] = ["user", "assistant"];

async function persistMessage(userId: string, msg: CopilotMessage): Promise<void> {
  if (!PERSIST_ROLES.includes(msg.role)) return;

  const { error } = await supabase.from("copilot_history").insert({
    id: msg.id,
    user_id: userId,
    role: msg.role,
    content: msg.content,
    agent: msg.agent ?? null,
    metadata: (msg.metadata as import("@/integrations/supabase/types").Json) ?? null,
    created_at: msg.timestamp.toISOString(),
  });

  if (error) {
    // Erros de rate-limit (code 42501) são esperados — não logar como erro.
    if (error.code === "42501" || /rate.limit/i.test(error.message)) {
      logger.warn("[copilot] history rate-limit atingido", { userId });
    } else {
      logger.error("[copilot] persistMessage error", {
        msgId: msg.id,
        role: msg.role,
        error: error.message,
      });
    }
  }
}

// Carrega os últimos N mensagens do banco ao montar o painel.
async function loadHistory(userId: string, limit = 50): Promise<CopilotMessage[]> {
  const { data, error } = await supabase
    .from("copilot_history")
    .select("id, role, content, agent, metadata, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    logger.error("[copilot] loadHistory error", { error: error.message });
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    role: row.role as MessageRole,
    content: row.content,
    agent: row.agent ?? undefined,
    metadata: (row.metadata as Record<string, unknown>) ?? undefined,
    timestamp: new Date(row.created_at),
  }));
}

// ─── Streaming HTTP contra a server route ───────────────────────────────────
const CHAT_ENDPOINT = "/api/copilot/chat";

// ─── Hook ───────────────────────────────────────────────────────────────────
export function useCopilot(config: CopilotConfig) {
  const { userId, marketContext = {}, traderProfile = {}, onAlert } = config;

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [isConnected, setIsConnected] = useState(true); // HTTP: sempre "conectado"
  const [isRecording, setIsRecording] = useState(false);
  const [latency, setLatency] = useState(0);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const messagesRef = useRef<CopilotMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const historyLoadedRef = useRef(false);
  useEffect(() => {
    historyLoadedRef.current = historyLoaded;
  }, [historyLoaded]);

  const addMessage = useCallback(
    (m: CopilotMessage) => {
      setMessages((p) => [...p, m]);
      if (historyLoadedRef.current) void persistMessage(userId, m);
    },
    [userId],
  );

  const authMsgIdRef = useRef<string | null>(null);
  const hasShownAuthMsgRef = useRef(false);
  const pendingMessageRef = useRef<string | null>(null);

  const clearUnauthMessage = useCallback(() => {
    const id = authMsgIdRef.current;
    if (id) setMessages((p) => p.filter((m) => m.id !== id));
    authMsgIdRef.current = null;
    hasShownAuthMsgRef.current = false;
  }, []);

  const showUnauthMessage = useCallback(() => {
    if (hasShownAuthMsgRef.current) return;
    const m = newMsg(
      "system",
      "Sua sessão expirou. Faça login novamente ou clique em Reconectar para tentar novamente.",
      { metadata: { action: "reconnect" } },
    );
    authMsgIdRef.current = m.id;
    setMessages((p) => [...p, m]);
    hasShownAuthMsgRef.current = true;
    setOrbState("idle");
  }, []);

  // Carregar histórico do banco ao montar (uma única vez por userId).
  useEffect(() => {
    if (!userId || historyLoaded) return;
    loadHistory(userId, 50).then((hist) => {
      if (hist.length > 0) setMessages(hist);
      setHistoryLoaded(true);
    });
  }, [userId, historyLoaded]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        clearUnauthMessage();
        setIsConnected(true);
      }
      if (event === "SIGNED_OUT") setIsConnected(false);
    });
    return () => {
      sub.subscription.unsubscribe();
      abortRef.current?.abort();
    };
  }, [clearUnauthMessage]);

  /** Faz a chamada streaming e vai atualizando a mensagem do assistente. */
  const streamAssistant = useCallback(
    async (history: CopilotMessage[], token: string) => {
      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;

      const startedAt = Date.now();
      setOrbState("thinking");

      const res = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({
          message: [...history].reverse().find((m) => m.role === "user")?.content ?? "",
          marketContext,
          traderProfile,
        }),
      });

      if (res.status === 401) {
        setOrbState("idle");
        showUnauthMessage();
        return false;
      }
      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => "");
        setOrbState("idle");
        setMessages((p) => [
          ...p,
          newMsg("system", `Falha ao responder (${res.status}). ${detail.slice(0, 160)}`),
        ]);
        return false;
      }

      const assistantId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setMessages((p) => [
        ...p,
        { id: assistantId, role: "assistant", content: "", timestamp: new Date() },
      ]);
      setOrbState("speaking");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setMessages((p) =>
            p.map((m) => (m.id === assistantId ? { ...m, content: acc } : m)),
          );
        }
      } catch (err) {
        logger.warn("[copilot] stream interrompido", { error: String(err) });
      }

      setLatency(Date.now() - startedAt);
      setOrbState("idle");

      if (acc.trim()) {
        void persistMessage(userId, {
          id: assistantId,
          role: "assistant",
          content: acc,
          timestamp: new Date(),
        });
      }
      return true;
    },
    [marketContext, traderProfile, showUnauthMessage, userId],
  );

  const runTurn = useCallback(
    async (text: string) => {
      const { data } = await supabase.auth.getSession();
      let token = data.session?.access_token;
      if (!token) {
        const refreshed = await supabase.auth.refreshSession();
        token = refreshed.data.session?.access_token;
      }
      if (!token) {
        pendingMessageRef.current = text;
        showUnauthMessage();
        return;
      }

      const userMsg = newMsg("user", text);
      addMessage(userMsg);
      const history = [...messagesRef.current, userMsg];
      await streamAssistant(history, token);
    },
    [addMessage, streamAssistant, showUnauthMessage],
  );

  const runTurnRef = useRef<((text: string) => Promise<void>) | null>(null);
  useEffect(() => {
    runTurnRef.current = runTurn;
  }, [runTurn]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      await runTurn(trimmed);
    },
    [runTurn],
  );

  const reconnect = useCallback(async () => {
    setOrbState("thinking");
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session?.access_token) {
      setOrbState("idle");
      return;
    }
    clearUnauthMessage();
    setIsConnected(true);
    const pending = pendingMessageRef.current;
    pendingMessageRef.current = null;
    if (pending) await runTurn(pending);
    else setOrbState("idle");
  }, [clearUnauthMessage, runTurn]);

  // Voz (Fase 6.1): o áudio gravado é enviado para /api/copilot/transcribe
  // (Lovable AI Gateway → STT em SSE) e o texto transcrito entra no mesmo
  // fluxo de streaming das mensagens digitadas.
  const transcribeAndSend = useCallback(
    async (blob: Blob) => {
      if (blob.size < 2048) {
        setOrbState("idle");
        setMessages((p) => [
          ...p,
          newMsg("system", "Gravação muito curta — segure o botão e fale novamente."),
        ]);
        return;
      }

      const { data } = await supabase.auth.getSession();
      let token = data.session?.access_token;
      if (!token) {
        const refreshed = await supabase.auth.refreshSession();
        token = refreshed.data.session?.access_token;
      }
      if (!token) {
        setOrbState("idle");
        showUnauthMessage();
        return;
      }

      const form = new FormData();
      form.append("audio", blob, "recording.webm");

      try {
        const res = await fetch("/api/copilot/transcribe", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
          body: form,
        });

        if (res.status === 401) {
          setOrbState("idle");
          showUnauthMessage();
          return;
        }
        if (!res.ok || !res.body) {
          const detail = await res.text().catch(() => "");
          setOrbState("idle");
          setMessages((p) => [
            ...p,
            newMsg("system", `Falha na transcrição (${res.status}). ${detail.slice(0, 160)}`),
          ]);
          return;
        }

        // SSE: acumula transcript.text.delta / usa transcript.text.done.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let transcript = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const evt = JSON.parse(payload) as {
                type?: string;
                delta?: string;
                text?: string;
              };
              if (evt.type === "transcript.text.delta" && evt.delta) transcript += evt.delta;
              else if (evt.type === "transcript.text.done" && evt.text) transcript = evt.text;
            } catch {
              /* evento parcial — ignora */
            }
          }
        }

        const finalText = transcript.trim();
        if (!finalText) {
          setOrbState("idle");
          setMessages((p) => [
            ...p,
            newMsg("system", "Não consegui entender o áudio — tente novamente."),
          ]);
          return;
        }
        await runTurnRef.current?.(finalText);
      } catch (err) {
        logger.error("[copilot] transcrição falhou", { error: String(err) });
        setOrbState("idle");
        setMessages((p) => [
          ...p,
          newMsg("system", "Falha ao enviar o áudio. Verifique sua conexão e tente novamente."),
        ]);
      }
    },
    [showUnauthMessage],
  );

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];
        // Sem timeslice: o blob final é um arquivo completo e decodificável.
        const blob = new Blob(chunks, { type: mimeType.split(";")[0] });
        void transcribeAndSend(blob);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setOrbState("listening");
    } catch (err) {
      logger.error("[Copilot] microphone denied", { error: err });
      setMessages((p) => [
        ...p,
        newMsg("system", "Não foi possível acessar o microfone. Permita o acesso e tente de novo."),
      ]);
    }
  }, [transcribeAndSend]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
    setOrbState("thinking");
  }, []);

  // Alertas proativos podem ser injetados por quem consome o hook.
  const pushAlert = useCallback(
    (content: string, agent?: string) => {
      const alert = newMsg("alert", content, { agent });
      setMessages((p) => [...p, alert]);
      setOrbState("alert");
      onAlert?.(alert);
      setTimeout(() => setOrbState("idle"), 4000);
    },
    [onAlert],
  );

  const clearHistory = useCallback(async () => {
    setMessages([]);
    const { error } = await supabase.from("copilot_history").delete().eq("user_id", userId);
    if (error) logger.error("[copilot] clearHistory error", { error: error.message });
  }, [userId]);

  return {
    messages,
    orbState,
    isConnected,
    isRecording,
    latency,
    historyLoaded,
    sendMessage,
    startRecording,
    stopRecording,
    clearHistory,
    reconnect,
    pushAlert,
  };
}

/** @deprecated Use `useCopilot` — `useCopilotWs` foi consolidado no mesmo hook. */
export const useCopilotWs = useCopilot;
