/**
 * Logger fino: em produção só emite `error`; em dev se comporta como console.
 * Use no lugar de console.log/debug/warn em código de produção (QA-02).
 */
/* eslint-disable no-console */
const isProd = import.meta.env.PROD;

export const logger = {
  debug: (...args: unknown[]) => {
    if (!isProd) console.debug(...args);
  },
  log: (...args: unknown[]) => {
    if (!isProd) console.log(...args);
  },
  info: (...args: unknown[]) => {
    if (!isProd) console.info(...args);
  },
  warn: (...args: unknown[]) => {
    if (!isProd) console.warn(...args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};
