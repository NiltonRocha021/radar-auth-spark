// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
//
// Páginas estáticas (legal) são pré-renderizadas em build time pelo TanStack
// Start: HTML completo é emitido em `dist/`, melhorando TTFB e indexação por
// crawlers que não executam JS. Conteúdo é 100% estático (sem loader/fetch),
// então o HTML pré-renderizado nunca fica stale.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
    prerender: {
      enabled: true,
    },
    pages: [
      { path: "/terms", prerender: { enabled: true } },
      { path: "/privacy", prerender: { enabled: true } },
    ],
  },
});
