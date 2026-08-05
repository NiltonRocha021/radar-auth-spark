// Mapeia o DTO da server function `listManipulationAlerts` para o tipo `Alert`
// consumido pela UI (antes vinha do manipulation.adapter/NestJS).
import type { Alert, Severity, AlertType } from "@/lib/manipulation-data";
import type { ManipulationAlertDTO } from "@/lib/manipulation.functions";

const ALERT_TYPES: AlertType[] = [
  "STOP HUNT",
  "LIQUIDITY GRAB",
  "FAKE BREAKOUT",
  "SPOOFING",
  "ABSORPTION",
  "PUMP&DUMP",
];

function formatAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return "agora";
  if (diff < 60) return `${diff}m ago`;
  return `${Math.floor(diff / 60)}h ago`;
}

function normalizeType(raw: string): AlertType {
  const up = (raw ?? "").toUpperCase().replace(/_/g, " ");
  return ALERT_TYPES.find((t) => t === up) ?? "STOP HUNT";
}

function normalizeSeverity(raw: string): Severity {
  const up = (raw ?? "").toUpperCase();
  return up === "HIGH" || up === "LOW" ? up : "MEDIUM";
}

export function mapManipulationAlert(dto: ManipulationAlertDTO): Alert {
  const extra = (dto.data && typeof dto.data === "object" && !Array.isArray(dto.data)
    ? (dto.data as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  const confidence = Number(extra["confidence"]);
  return {
    id: dto.id,
    severity: normalizeSeverity(dto.severity),
    type: normalizeType(dto.alertType),
    asset: dto.symbol,
    tf: typeof extra["timeframe"] === "string" ? (extra["timeframe"] as string) : "1H",
    confidence: Number.isFinite(confidence) ? confidence : 50,
    ago: formatAgo(dto.detectedAt || dto.createdAt),
    desc: dto.message ?? "",
    action: typeof extra["action"] === "string" ? (extra["action"] as string) : "",
    detail: typeof extra["detail"] === "string" ? (extra["detail"] as string) : "",
  };
}
