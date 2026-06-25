/**
 * Structured logger com integração Sentry em produção.
 *
 * - Em dev: console.* normal (legível).
 * - Em prod: JSON estruturado em uma linha (pronto para ingestão) e
 *   forward de `error`/`warn` para Sentry quando configurado.
 */
/* eslint-disable no-console */
import { Sentry } from "./sentry";

const isProd = import.meta.env.PROD;

type Context = Record<string, unknown>;

function emit(level: "debug" | "log" | "info" | "warn" | "error", message: string, context?: Context) {
  if (isProd) {
    const line = JSON.stringify({
      level,
      message,
      ...(context ?? {}),
      ts: new Date().toISOString(),
    });
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else if (level === "info") console.info(line);
    else if (level === "debug") console.debug(line);
    else console.log(line);
    return;
  }
  // Dev: argumentos crus pra preservar object inspection no devtools.
  if (level === "error") console.error(message, context ?? "");
  else if (level === "warn") console.warn(message, context ?? "");
  else if (level === "info") console.info(message, context ?? "");
  else if (level === "debug") console.debug(message, context ?? "");
  else console.log(message, context ?? "");
}

export const logger = {
  debug: (message: string, context?: Context) => {
    if (!isProd) emit("debug", message, context);
  },
  log: (message: string, context?: Context) => {
    if (!isProd) emit("log", message, context);
  },
  info: (message: string, context?: Context) => {
    if (!isProd) emit("info", message, context);
  },
  warn: (message: string, context?: Context) => {
    emit("warn", message, context);
    if (isProd) Sentry.captureMessage(message, { level: "warning", extra: context });
  },
  error: (message: string, context?: Context) => {
    emit("error", message, context);
    if (isProd) {
      const err = context?.error;
      if (err instanceof Error) {
        Sentry.captureException(err, { extra: { message, ...context } });
      } else {
        Sentry.captureMessage(message, { level: "error", extra: context });
      }
    }
  },
};
