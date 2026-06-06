// Hook que conecta o CopilotPanel ao backend NestJS real via ws.client.ts.
// Mantém EXATAMENTE a mesma API pública de useCopilot — não muda layout/estados.
import { useCallback, useEffect, useRef, useState } from 'react';
import { backendWs } from '@/adapters/backend/ws.client';
import {
  buildChatMessage,
  buildInit,
  normalizeInbound,
} from '@/adapters/backend/copilot.adapter';
import type {
  CopilotConfig,
  CopilotMessage,
  MessageRole,
  OrbState,
} from './useCopilot';

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
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [latency, setLatency] = useState(0);

  const addMessage = (m: CopilotMessage) => setMessages((p) => [...p, m]);

  function playAudio(base64: string) {
    const audio = new Audio(`data:audio/mpeg;base64,${base64}`);
    setOrbState('speaking');
    audio.onended = () => setOrbState('idle');
    audio.play().catch(() => setOrbState('idle'));
  }

  // Conecta e escuta o canal copilot:message
  useEffect(() => {
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    backendWs.connect('/copilot').then(() => {
      if (!initSentRef.current) {
        backendWs.send('chat_message', { __init: true });
        backendWs.send('copilot:init', buildInit(userId, marketContext as Record<string, unknown>, traderProfile as Record<string, unknown>));
        initSentRef.current = true;
      }
    });

    // Heurística de "conectado" — refletir status do socket interno
    pollTimer = setInterval(() => {
      // backendWs não expõe estado; consideramos conectado se um init já foi enviado
      setIsConnected(initSentRef.current);
    }, 1000);

    const off = backendWs.on('copilot:message', (payload) => {
      const data = normalizeInbound(payload);
      if (!data) return;
      switch (data.type) {
        case 'thinking':
          setOrbState('thinking');
          break;
        case 'chat_response':
          addMessage(newMsg('assistant', data.text ?? '', { metadata: data.metadata }));
          setOrbState('idle');
          if (typeof data.latency === 'number') setLatency(data.latency);
          break;
        case 'voice_response':
          addMessage(newMsg('assistant', data.text ?? '', { metadata: data.metadata }));
          if (data.audio_base64) playAudio(data.audio_base64);
          setOrbState('idle');
          break;
        case 'transcript':
          addMessage(newMsg('user', data.text ?? ''));
          setOrbState('thinking');
          break;
        case 'proactive_alert': {
          const alert = newMsg('alert', data.content ?? '', { agent: data.agent });
          addMessage(alert);
          setOrbState('alert');
          onAlert?.(alert);
          setTimeout(() => setOrbState('idle'), 4000);
          break;
        }
        case 'system_message':
          addMessage(newMsg('system', data.content ?? ''));
          break;
      }
    });

    return () => {
      off();
      if (pollTimer) clearInterval(pollTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      addMessage(newMsg('user', text));
      setOrbState('thinking');
      backendWs.send(
        'chat_message',
        buildChatMessage(
          userId,
          text,
          marketContext as Record<string, unknown>,
          traderProfile as Record<string, unknown>,
        ),
      );
    },
    [userId, marketContext, traderProfile],
  );

  function sendVoice(blob: Blob, mimeType: string) {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      backendWs.send('voice_input', {
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
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
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
      setOrbState('listening');
    } catch (err) {
      console.error('[CopilotWs] mic denied', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    setOrbState('thinking');
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
  };
}
