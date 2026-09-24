export type Method = "GET" | "POST" | "WS";

export type Endpoint = {
  method: Method;
  path: string;
  desc: string;
  responseMs: number;
};

export const ENDPOINTS: Endpoint[] = [
  { method: "GET", path: "/api/public/v1/signals", desc: "List active signals with status and limit filters", responseMs: 32 },
];

export const SNIPPETS = {
  javascript: `// GET /api/public/v1/signals — list active signals
const res = await fetch("https://signalsignin.company/api/public/v1/signals?status=active&limit=20", {
  headers: {
    "Authorization": "Bearer asr_live_YOUR_API_KEY",
    "Content-Type": "application/json"
  }
});
const { data } = await res.json();
console.log(data);`,
  python: `# GET /api/public/v1/signals — list active signals
import requests

res = requests.get(
    "https://signalsignin.company/api/public/v1/signals",
    params={"status": "active", "limit": 20},
    headers={"Authorization": "Bearer asr_live_YOUR_API_KEY"}
)
print(res.json())`,
  curl: `curl -X GET "https://signalsignin.company/api/public/v1/signals?status=active&limit=20" \
  -H "Authorization: Bearer asr_live_YOUR_API_KEY" \
  -H "Content-Type: application/json"`,
};

export const RESPONSE_JSON = `{
  "data": [
    {
      "id": "sig_9f3a2c",
      "asset": "BTC",
      "timeframe": "4h",
      "type": "long",
      "confidence": 87,
      "entry": 64320.5,
      "tp": 65800.0,
      "sl": 63400.0,
      "created_at": "2026-05-24T14:22:00Z"
    }
  ],
  "meta": { "count": 1, "rate_remaining": 4982 }
}`;

export const RATE_LIMITS = [
  { plan: "Starter", limit: "100 req/day", burst: "10 req/min", streams: "—" },
  { plan: "Pro", limit: "5,000 req/day", burst: "60 req/min", streams: "1 WS" },
  { plan: "Institutional", limit: "Unlimited", burst: "600 req/min", streams: "Unlimited WS" },
];

export const WEBHOOK_EVENTS = [
  { id: "new_signal", label: "new signal" },
  { id: "manipulation_alert", label: "manipulation alert" },
  { id: "score_change", label: "score change" },
];

export const RECENT_DELIVERIES = [
  { ts: "2026-05-24 14:22:08", event: "new_signal", status: 200, ms: 142 },
  { ts: "2026-05-24 14:18:51", event: "score_change", status: 200, ms: 98 },
  { ts: "2026-05-24 14:12:33", event: "manipulation_alert", status: 200, ms: 184 },
  { ts: "2026-05-24 13:58:02", event: "new_signal", status: 500, ms: 3021 },
  { ts: "2026-05-24 13:44:18", event: "new_signal", status: 200, ms: 121 },
];
