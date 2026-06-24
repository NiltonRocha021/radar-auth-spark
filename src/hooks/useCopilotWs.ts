// Hook que conecta o CopilotPanel ao backend NestJS real via ws.client.ts.
// Mantém EXATAMENTE a mesma API pública de useCopilot — não muda layout/estados.
import { useCallback, useEffect, useRef, useState } from "react";
import { backendWs, type WsStatus } from "@/adapters/backend/ws-client";
import { supabase } from "@/integrations/supabase/client";
import { buildChatMessage, buildInit, normalizeInbound } from "@/adapters/backend/copilot.adapter";
import type { CopilotConfig, CopilotMessage, MessageRole, OrbState } from "./useCopilot";

function newMsg(role: MessageRole, content: string, extras: Partial<CopilotMessage> = {}): CopilotMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    timestamp: new Date(),
    ...extras,
  };
}

export function useCopilotWs(config: CopilotConfig) {
  const { userId, marketContext = {}, traderProfile = {}, onAlert } = config;

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const initSentRef = useRef(false);

  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [isConnected, setIsConnected] = useState(false);
  const [wsStatus, setWsStatus] = useState<WsStatus>("idle");
  const [isRecording, setIsRecording] = useState(false);
  const [latency, setLatency] = useState(0);

  const addMessage = (m: CopilotMessage) => setMessages((p) => [...p, m]);
  const hasShownAuthMsgRef = useRef(false);
  const pendingMessageRef = useRef<string | null>(null);
  const authMsgIdRef = useRef<string | null>(null);

  // Remove a system-message de "sessão expirada" do histórico (após reconectar).
  const clearUnauthMessage = useCallback(() => {
    const id = authMsgIdRef.current;
    if (id) setMessages((p) => p.filter((m) => m.id !== id));
    authMsgIdRef.current = null;
    hasShownAuthMsgRef.current = false;
  }, []);

  function playAudio(base64: string) {
    const audio = new Audio(`data:audio/mpeg;base64,${base64}`);
    setOrbState("speaking");
    audio.onended = () => setOrbState("idle");
    audio.play().catch(() => setOrbState("idle"));
  }

  // Conecta e escuta o canal copilot:message
  useEffect(() => {
    let cancelled = false;

    const offStatus = backendWs.onStatus((s) => {
      if (cancelled) return;
      setWsStatus(s);
      setIsConnected(s === "open");
      if (s === "open" && !initSentRef.current) {
        backendWs.send(
          "copilot:init",
          buildInit(userId, marketContext as Record<string, unknown>, traderProfile as Record<string, unknown>),
        );
        initSentRef.current = true;
      }
      if (s === "unauthenticated" && !hasShownAuthMsgRef.current) {
        const m = newMsg(
          "system",
          "Você precisa estar autenticado para usar o Copilot. Clique em Reconectar para tentar novamente ou faça login.",
          { metadata: { action: "reconnect" } },
        );
        authMsgIdRef.current = m.id;
        addMessage(m);
        hasShownAuthMsgRef.current = true;
        setOrbState("idle");
      }
      if (s === "open") {
        // Reconexão bem-sucedida: remove aviso e reenvia mensagem pendente
        if (authMsgIdRef.current) {
          const id = authMsgIdRef.current;
          setMessages((p) => p.filter((mm) => mm.id !== id));
          authMsgIdRef.current = null;
        }
        hasShownAuthMsgRef.current = false;
        const pending = pendingMessageRef.current;
        pendingMessageRef.current = null;
        if (pending) {
          backendWs.send(
            "chat_message",
            buildChatMessage(
              userId,
              pending,
              marketContext as Record<string, unknown>,
              traderProfile as Record<string, unknown>,
            ),
          );
          addMessage(newMsg("user", pending));
          setOrbState("thinking");
        }
      }
    });

    backendWs.connect("/copilot");

    // Reconecta automaticamente quando o usuário faz login/logout
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        initSentRef.current = false;
        backendWs.connect("/copilot");
      }
      if (event === "SIGNED_OUT") {
        initSentRef.current = false;
        backendWs.close();
      }
    });

    const off = backendWs.on("copilot:message", (payload) => {
      const data = normalizeInbound(payload);
      if (!data) return;
      switch (data.type) {
        case "thinking":
          setOrbState("thinking");
          break;
        case "chat_response":
          addMessage(newMsg("assistant", data.text ?? "", { metadata: data.metadata }));
          setOrbState("idle");
          if (typeof data.latency === "number") setLatency(data.latency);
          break;
        case "voice_response":
          addMessage(newMsg("assistant", data.text ?? "", { metadata: data.metadata }));
          if (data.audio_base64) playAudio(data.audio_base64);
          setOrbState("idle");
          break;
        case "transcript":
          addMessage(newMsg("user", data.text ?? ""));
          setOrbState("thinking");
          break;
        case "proactive_alert": {
          const alert = newMsg("alert", data.content ?? "", { agent: data.agent });
          addMessage(alert);
          setOrbState("alert");
          onAlert?.(alert);
          setTimeout(() => setOrbState("idle"), 4000);
          break;
        }
        case "system_message":
          addMessage(newMsg("system", data.content ?? ""));
          break;
      }
    });

    return () => {
      cancelled = true;
      off();
      offStatus();
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const showUnauthMessage = useCallback(() => {
    if (hasShownAuthMsgRef.current) return;
    const m = newMsg(
      "system",
      "Sua sessão expirou. Faça login novamente ou clique em Reconectar para tentar novamente.",
      { metadata: { action: "reconnect" } },
    );
    authMsgIdRef.current = m.id;
    addMessage(m);
    hasShownAuthMsgRef.current = true;
    setOrbState("idle");
  }, []);

  // Tenta refrescar o token Supabase e reabrir o WS.
  // Se vier do botão "Reconectar" e houver mensagem pendente, reenvia.
  const tryRefreshAndReconnect = useCallback(async (): Promise<WsStatus> => {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session?.access_token) return "unauthenticated";
    initSentRef.current = false;
    return backendWs.connect("/copilot");
  }, []);

  const doSend = useCallback(
    (text: string) => {
      addMessage(newMsg("user", text));
      setOrbState("thinking");
      const sent = backendWs.send(
        "chat_message",
        buildChatMessage(
          userId,
          text,
          marketContext as Record<string, unknown>,
          traderProfile as Record<string, unknown>,
        ),
      );
      return sent;
    },
    [userId, marketContext, traderProfile],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // Revalida token; se ausente/expirado, tenta refresh antes de desistir.
      const { data } = await supabase.auth.getSession();
      let token = data.session?.access_token;
      if (!token) {
        const status = await tryRefreshAndReconnect();
        if (status !== "open") {
          pendingMessageRef.current = trimmed;
          showUnauthMessage();
          return;
        }
        token = (await supabase.auth.getSession()).data.session?.access_token;
      }

      if (!backendWs.isAuthenticatedOpen()) {
        const status = await backendWs.connect("/copilot");
        if (status !== "open") {
          // Última tentativa: refresh + reconectar
          const refreshed = await tryRefreshAndReconnect();
          if (refreshed !== "open") {
            pendingMessageRef.current = trimmed;
            showUnauthMessage();
            return;
          }
        }
      }

      const sent = doSend(trimmed);
      if (!sent) {
        pendingMessageRef.current = trimmed;
        showUnauthMessage();
      }
    },
    [doSend, showUnauthMessage, tryRefreshAndReconnect],
  );

  // Acionado pelo botão "Reconectar" na bolha de sessão expirada.
  const reconnect = useCallback(async () => {
    setOrbState("thinking");
    const status = await tryRefreshAndReconnect();
    if (status === "open") {
      clearUnauthMessage();
      const pending = pendingMessageRef.current;
      pendingMessageRef.current = null;
      if (pending) doSend(pending);
      else setOrbState("idle");
    } else {
      setOrbState("idle");
      // mantém a mensagem de auth; nada a fazer
    }
  }, [tryRefreshAndReconnect, clearUnauthMessage, doSend]);

  function sendVoice(blob: Blob, mimeType: string) {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      backendWs.send("voice_input", {
        userId,
        audio_base64: base64,
        mime_type: mimeType,
        context: { market: marketContext, trader: traderProfile },
      });
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
      console.error("[CopilotWs] mic denied", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    setOrbState("thinking");
  }, []);

  const clearHistory = () => setMessages([]);

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
    reconnect,
  };
}
