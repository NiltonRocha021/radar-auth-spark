// PWA-01: registro guardado do service worker.
//
// Regras (skill/pwa):
// - NUNCA registrar em dev, iframe, preview Lovable, ou quando ?sw=off.
// - Em qualquer contexto recusado, des-registrar SWs existentes em /sw.js
//   para evitar que um SW antigo continue servindo HTML obsoleto.
// - autoUpdate: o plugin injeta o cliente; aqui apenas decidimos registrar.

const SW_PATH = "/sw.js";
const APP_CACHE_PREFIXES = ["html-cache", "api-cache", "asset-cache", "workbox-precache"];

function isRefusedHost(hostname: string): boolean {
  if (hostname.startsWith("id-preview--") || hostname.startsWith("preview--")) return true;
  if (hostname === "lovableproject.com" || hostname.endsWith(".lovableproject.com")) return true;
  if (hostname === "lovableproject-dev.com" || hostname.endsWith(".lovableproject-dev.com"))
    return true;
  if (hostname === "beta.lovable.dev" || hostname.endsWith(".beta.lovable.dev")) return true;
  return false;
}

async function unregisterMatching(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((r) => {
          const url = r.active?.scriptURL ?? r.installing?.scriptURL ?? r.waiting?.scriptURL ?? "";
          return url.endsWith(SW_PATH);
        })
        .map((r) => r.unregister()),
    );
  } catch {
    // best-effort
  }
}

/** Remove respostas antigas deixadas por versões anteriores do PWA no preview. */
async function clearAppCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => APP_CACHE_PREFIXES.some((prefix) => name.includes(prefix)))
        .map((name) => caches.delete(name)),
    );
  } catch {
    // best-effort: a aplicação continua pela rede.
  }
}

export async function resetPwaRuntime(): Promise<void> {
  await Promise.all([unregisterMatching(), clearAppCaches()]);
}

export function registerPWA(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const url = new URL(window.location.href);
  const refused =
    !import.meta.env.PROD ||
    window.self !== window.top ||
    isRefusedHost(window.location.hostname) ||
    url.searchParams.get("sw") === "off";

  if (refused) {
    void resetPwaRuntime();
    return;
  }

  // Dynamic import to keep workbox-window out of refused bundles' critical path.
  void import("workbox-window").then(({ Workbox }) => {
    const wb = new Workbox(SW_PATH, { scope: "/" });
    wb.addEventListener("waiting", () => {
      // autoUpdate: skip waiting so the new SW activates on next navigation.
      wb.messageSkipWaiting();
    });
    wb.register().catch(() => {
      /* network or SSL failure — ignore */
    });
  });
}
