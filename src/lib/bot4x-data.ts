import { type Candle } from "./market-data";
export type ExecMode = "DEMO" | "REAL";
export type Side = "LONG" | "SHORT";
export type CalibProfile =
  | "conservador"
  | "rsi"
  | "aiscore"
  | "agressivo"
  | "scalper"
  | "intraday"
  | "swing"
  | "position";

export type ProfileSpec = {
  id: CalibProfile;
  name: string;
  color: string;
  riskLabel: string;
  desc: string;
  rsiBuy: number;
  rsiSell: number;
  aiScore: number;
  fomo: number;
  wr: number;
  blockings30d: number;
  trades30d: number;
  riskRank: 1 | 2 | 3 | 4;
  warning?: { level: "amber" | "red"; text: string };
  levMatrix: Record<number, "ok" | "warn" | "no">;
};

export const PROFILES: Record<CalibProfile, ProfileSpec> = {
  conservador: {
    id: "conservador",
    name: "Conservador",
    color: "#3B6D11",
    riskLabel: "Risco Baixo",
    desc: "Máxima proteção patrimonial. Opera apenas em confluências institucionais perfeitas.",
    rsiBuy: 35,
    rsiSell: 65,
    aiScore: 85,
    fomo: 15,
    wr: 62,
    blockings30d: 647,
    trades30d: 183,
    riskRank: 1,
    levMatrix: { 1: "ok", 2: "ok", 3: "ok", 4: "warn", 5: "warn", 6: "warn", 7: "warn", 8: "no", 9: "no", 10: "no" },
  },
  rsi: {
    id: "rsi",
    name: "Calibrado RSI",
    color: "#185FA5",
    riskLabel: "Risco Moderado",
    desc: "RSI ampliado para capturar extremos menos severos. Reduz ~25% dos bloqueios.",
    rsiBuy: 40,
    rsiSell: 60,
    aiScore: 85,
    fomo: 15,
    wr: 59,
    blockings30d: 485,
    trades30d: 221,
    riskRank: 2,
    warning: { level: "amber", text: "⚠ Monitorar disjuntores em lev 1:6 e 1:10" },
    levMatrix: { 1: "ok", 2: "ok", 3: "ok", 4: "ok", 5: "warn", 6: "warn", 7: "warn", 8: "warn", 9: "no", 10: "no" },
  },
  aiscore: {
    id: "aiscore",
    name: "Calibrado aiScore",
    color: "#534AB7",
    riskLabel: "Risco Médio",
    desc: "aiScore reduzido para 78. Libera sinais em dias de baixa volatilidade.",
    rsiBuy: 35,
    rsiSell: 65,
    aiScore: 78,
    fomo: 15,
    wr: 57,
    blockings30d: 516,
    trades30d: 208,
    riskRank: 3,
    warning: { level: "red", text: "⛔ Não usar com alavancagem 1:8 e 1:10" },
    levMatrix: { 1: "ok", 2: "ok", 3: "ok", 4: "ok", 5: "warn", 6: "warn", 7: "warn", 8: "no", 9: "no", 10: "no" },
  },
  agressivo: {
    id: "agressivo",
    name: "Agressivo",
    color: "#A32D2D",
    riskLabel: "Risco Alto",
    desc: "RSI 40/60 + aiScore 78 + FOMO 20%. Máximo volume de operações.",
    rsiBuy: 40,
    rsiSell: 60,
    aiScore: 78,
    fomo: 20,
    wr: 53,
    blockings30d: 378,
    trades30d: 267,
    riskRank: 4,
    warning: { level: "red", text: "🚨 EXCLUSIVO para alavancagem 1:1 e 1:3" },
    levMatrix: { 1: "ok", 2: "ok", 3: "warn", 4: "warn", 5: "warn", 6: "warn", 7: "no", 8: "no", 9: "no", 10: "no" },
  },
  scalper: {
    id: "scalper" as CalibProfile,
    name: "Scalper",
    color: "#E0A82E",
    riskLabel: "Scalping M1-M5",
    desc: "ScalperEngine: EMA9/21, VWAP, ATR, volume e momentum. Confluência ≥80% em M1/M3/M5.",
    rsiBuy: 35,
    rsiSell: 65,
    aiScore: 80,
    fomo: 25,
    wr: 56,
    blockings30d: 420,
    trades30d: 312,
    riskRank: 4,
    warning: { level: "amber", text: "⚠ Scalping de alta frequência — requer baixo spread" },
    levMatrix: { 1: "ok", 2: "ok", 3: "ok", 4: "warn", 5: "warn", 6: "warn", 7: "no", 8: "no", 9: "no", 10: "no" },
  },
  intraday: {
    id: "intraday" as CalibProfile,
    name: "Intraday",
    color: "#2E86C1",
    riskLabel: "Intraday M15-H1",
    desc: "IntradayEngine: EMA20/50, RSI, MACD, ATR, volume crescente e estrutura. RR ≥ 1:2.",
    rsiBuy: 40,
    rsiSell: 60,
    aiScore: 80,
    fomo: 20,
    wr: 58,
    blockings30d: 390,
    trades30d: 178,
    riskRank: 3,
    warning: { level: "amber", text: "⚠ Requer tendência clara e volume crescente" },
    levMatrix: { 1: "ok", 2: "ok", 3: "ok", 4: "ok", 5: "warn", 6: "warn", 7: "warn", 8: "no", 9: "no", 10: "no" },
  },
  swing: {
    id: "swing" as CalibProfile,
    name: "Swing",
    color: "#16A085",
    riskLabel: "Swing H4-D1",
    desc: "SwingEngine: EMA50/200, RSI, MACD, ADX, volume institucional. Confluência ≥75%, RR ≥1:3.",
    rsiBuy: 45,
    rsiSell: 55,
    aiScore: 75,
    fomo: 30,
    wr: 61,
    blockings30d: 340,
    trades30d: 92,
    riskRank: 2,
    warning: { level: "amber", text: "⚠ Requer ADX favorável e tendência confirmada" },
    levMatrix: { 1: "ok", 2: "ok", 3: "ok", 4: "ok", 5: "warn", 6: "warn", 7: "no", 8: "no", 9: "no", 10: "no" },
  },
  position: {
    id: "position" as CalibProfile,
    name: "Position",
    color: "#8E44AD",
    riskLabel: "Position D1-W1",
    desc: "PositionEngine: EMA200/400, ciclo macro, fluxo institucional, correlação BTC/ETH. Confluência ≥70%, RR ≥1:4.",
    rsiBuy: 50,
    rsiSell: 50,
    aiScore: 70,
    fomo: 40,
    wr: 64,
    blockings30d: 280,
    trades30d: 32,
    riskRank: 2,
    warning: { level: "amber", text: "⚠ Tendência macro de longo prazo — exposição prolongada" },
    levMatrix: { 1: "ok", 2: "ok", 3: "ok", 4: "warn", 5: "warn", 6: "no", 7: "no", 8: "no", 9: "no", 10: "no" },
  },
};

// Fonte única de verdade para a ordem "mais seguro → mais arriscado" entre perfis.
// Derivada do `riskRank` de cada ProfileSpec acima — não duplicar esta lista em
// outros arquivos (era a causa do bug onde dna-auto-corrector.ts e
// dna-sim-corrector.ts discordavam sobre a posição de "swing" e "position").
// Sort é estável (ES2019+), então perfis com o mesmo riskRank mantêm a ordem
// de declaração em PROFILES acima.
export const PROFILE_RISK_LADDER: CalibProfile[] = (Object.keys(PROFILES) as CalibProfile[]).sort(
  (a, b) => PROFILES[a].riskRank - PROFILES[b].riskRank,
);

export function leverageRisk(lev: number): {
  tier: "low" | "med" | "high";
  label: string;
  color: string;
  diagnosis: string;
} {
  if (lev <= 3)
    return {
      tier: "low",
      label: "🟢 RISCO BAIXO",
      color: "#1D9E75",
      diagnosis: "Volatilidade absorvida. Boa zona para acumulação de WR.",
    };
  if (lev <= 7)
    return {
      tier: "med",
      label: "🟡 RISCO MÉDIO",
      color: "#EF9F27",
      diagnosis: "Alavancagem operacional. Requer disciplina de stop.",
    };
  return {
    tier: "high",
    label: "🔴 RISCO ALTO",
    color: "#E24B4A",
    diagnosis: "Liquidação próxima. Apenas com perfil Conservador + filtros máximos.",
  };
}

export function slTpFromLeverage(lev: number) {
  const sl = (0.005 / lev) * 100;
  const tp = (0.01 / lev) * 100;
  return { sl: sl.toFixed(3), tp: tp.toFixed(3) };
}

export type Order = {
  id: string;
  pair: string;
  side: Side;
  entry: number;
  sl: number;
  tp: number;
  openedAt: number;
  pnlPct: number;
};

export type FilterKey = "F1" | "F2" | "F3" | "F4" | "F5" | "F6";
export const FILTER_NAMES: Record<FilterKey, string> = {
  F1: "Universo",
  F2: "Grade",
  F3: "Par",
  F4: "Canal",
  F5: "Confluência",
  F6: "FOMO",
};

export type ChannelZone = "BOTTOM" | "MIDDLE" | "TOP";
export type TickSide = "BUY" | "SELL" | null;
export type Verdict = "EXECUTE" | "IGNORE" | "FOMO_BLOCKED" | "GRID_SATURATED" | "EMERGENCY_SHUTDOWN";
export type F5SubKey = "RSI" | "AISCORE" | "LIQGRAB";

export type Tick = {
  id: string;
  ts: number;
  pair: string;
  side: TickSide;
  channelZone: ChannelZone;
  rsi: number;
  aiScore: number;
  liquidityGrab: boolean;
  fomoDisplacement: number;
  // current calibration snapshot
  profileId: CalibProfile;
  rsiBuy: number;
  rsiSell: number;
  aiScoreMin: number;
  fomoLimit: number;
  // open slots used at the moment
  slotsUsed: number;
  // filter results
  filters: Record<FilterKey, boolean>;
  blockedAt?: FilterKey;
  f5Sub?: F5SubKey; // which sub-criterion of F5 failed
  verdict: Verdict;
  detail: Record<FilterKey, string>;
};

export type Trade = {
  id: string;
  day: string;
  pair: string;
  side: Side;
  entry: number;
  stop: number;
  target: number;
  result: "WIN" | "LOSS" | "BLOCKED" | "SHUTDOWN";
  pnl: number;
  pnlPct: number;
  accumulated: number;
  profile: CalibProfile;
  leverage: number;
  motivo: string;
  hour: number;
};

const PAIRS = ["BTC/USDT","ETH/USDT","BNB/USDT","SOL/USDT","XRP/USDT","ADA/USDT","DOGE/USDT","TRX/USDT","AVAX/USDT","LINK/USDT","DOT/USDT","MATIC/USDT","TON/USDT","SHIB/USDT","LTC/USDT","BCH/USDT","UNI/USDT","ATOM/USDT","XLM/USDT","NEAR/USDT"];
const MAX_SLOTS = 10;
export type MarketAnalysis={symbol:string;pair:string;timeframe:string;price:number;rsi:number;aiScore:number;liquidityGrab:boolean;fomoDisplacement:number;channelZone:ChannelZone;side:TickSide;atr:number;vwap:number;emaFast:number;emaSlow:number;volumeRatio:number;macd:number;macdSignal:number;trendStrength:number};
type MakeTickCtx={profile:ProfileSpec;slotsUsed:number;busyPairs?:string[];shutdown?:boolean;market?:MarketAnalysis};
const clamp=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n)); const round=(n:number,d=2)=>Number(n.toFixed(d));
function sma(v:number[],p:number){const x=v.slice(-Math.max(1,Math.min(p,v.length)));return x.reduce((a,b)=>a+b,0)/x.length}
function ema(v:number[],p:number){if(!v.length)return 0;const k=2/(p+1);let e=v[0];for(let i=1;i<v.length;i++)e=v[i]*k+e*(1-k);return e}
function rsi(v:number[],p=14){if(v.length<2)return 50;let g=0,l=0;const s=Math.max(1,v.length-p);for(let i=s;i<v.length;i++){const d=v[i]-v[i-1];if(d>=0)g+=d;else l-=d}const n=Math.max(1,v.length-s),ag=g/n,al=l/n;return al===0?100:100-100/(1+ag/al)}
function atr(cs:Candle[],p=14){const t:number[]=[];for(let i=1;i<cs.length;i++){const c=cs[i],q=cs[i-1];t.push(Math.max(c.high-c.low,Math.abs(c.high-q.close),Math.abs(c.low-q.close)))}return t.length?sma(t,p):0}
function vwap(cs:Candle[],p=50){const x=cs.slice(-p);let pv=0,v=0;for(const c of x){pv+=((c.high+c.low+c.close)/3)*c.volume;v+=c.volume}return v?pv/v:x.at(-1)?.close??0}
function macd(v:number[]){const line=ema(v,12)-ema(v,26), hs:number[]=[];for(let i=25;i<v.length;i++)hs.push(ema(v.slice(0,i+1),12)-ema(v.slice(0,i+1),26));return {line,signal:ema(hs,9)}}
export function analyzeCandles(symbol:string,timeframe:string,cs:Candle[]):MarketAnalysis{if(cs.length<30)throw new Error("Dados insuficientes para análise");const v=cs.map(c=>c.close),price=v.at(-1)!;const fp=timeframe==="5m"?9:timeframe==="15m"?20:timeframe==="1h"?20:timeframe==="4h"?50:200;const sp=timeframe==="5m"?21:timeframe==="15m"?50:timeframe==="1h"?50:timeframe==="4h"?200:400;const ef=ema(v,fp),es=ema(v,Math.min(sp,v.length));const avg=sma(v,20),sd=Math.sqrt(sma(v.map(x=>(x-avg)**2),20)),upper=avg+2*sd,lower=avg-2*sd;const zone:ChannelZone=price<=lower?"BOTTOM":price>=upper?"TOP":"MIDDLE";const side:TickSide=zone==="BOTTOM"?"BUY":zone==="TOP"?"SELL":null;const va=sma(cs.map(c=>c.volume),20),vr=va?cs.at(-1)!.volume/va:1,last=cs.at(-1)!,range=Math.max(last.high-last.low,Number.EPSILON),lw=Math.min(last.open,last.close)-last.low,uw=last.high-Math.max(last.open,last.close);const liq=vr>=1.2&&(lw/range>=.45||uw/range>=.45);const prev=cs.at(-2)!.close,fomo=Math.abs((price-prev)/prev)*100,m=macd(v),trend=ef>=es?1:-1;const trendScore=side?(trend===(side==="BUY"?1:-1)?20:5):0;const rs=rsi(v),rsiScore=side?(side==="BUY"?clamp((50-rs)*2,0,20):clamp((rs-50)*2,0,20)):0;const macScore=side?(side==="BUY"?(m.line>m.signal?15:0):(m.line<m.signal?15:0)):0;const vw=vwap(cs),vwScore=side?(side==="BUY"?(price<=vw?10:0):(price>=vw?10:0)):0;const volScore=clamp((vr-1)*15,0,15),liqScore=liq?10:0,score=round(clamp(30+trendScore+rsiScore+macScore+vwScore+volScore+liqScore,0,100),1);return{symbol,pair:symbol.replace("USDT","/USDT"),timeframe,price,rsi:round(rs,1),aiScore:score,liquidityGrab:liq,fomoDisplacement:round(fomo,2),channelZone:zone,side,atr:atr(cs),vwap:vw,emaFast:ef,emaSlow:es,volumeRatio:round(vr,2),macd:m.line,macdSignal:m.signal,trendStrength:round(Math.abs(ef-es)/Math.max(price,Number.EPSILON)*1000,2)}}
export function makeTick(ctx:MakeTickCtx):Tick{const{profile,slotsUsed,busyPairs=[],shutdown=false,market}=ctx;if(!market)throw new Error("makeTick exige análise real de mercado");const pair=market.pair;const filters:Record<FilterKey,boolean>={F1:PAIRS.includes(pair),F2:true,F3:true,F4:true,F5:true,F6:true};const detail:Record<FilterKey,string>={F1:filters.F1?"Universo Binance USDT":"Par fora do universo",F2:`${slotsUsed}/${MAX_SLOTS} slots`,F3:"Par livre",F4:`Zona ${market.channelZone}`,F5:`RSI ${market.rsi} · score ${market.aiScore} · liqGrab ${market.liquidityGrab?"✓":"✗"} · ${profile.name}`,F6:`Desl. ${market.fomoDisplacement}% (≤ ${profile.fomo}%)`};let blockedAt:FilterKey|undefined,f5Sub:F5SubKey|undefined,verdict:Verdict="EXECUTE";const block=(k:FilterKey,v:Verdict,d:string)=>{filters[k]=false;blockedAt=k;verdict=v;detail[k]=d};if(!filters.F1)block("F1","IGNORE","Par fora do universo Binance");else if(slotsUsed>=MAX_SLOTS)block("F2","GRID_SATURATED",`Grade ${MAX_SLOTS}/${MAX_SLOTS} — saturada`);else if(busyPairs.includes(pair))block("F3","IGNORE",`Par ${pair} já ativo`);else if(!market.side)block("F4","IGNORE","Sem extremo de canal confirmado");else if(market.side==="BUY"&&market.rsi>=profile.rsiBuy){f5Sub="RSI";block("F5","IGNORE",`RSI ${market.rsi} ≥ ${profile.rsiBuy}`)}else if(market.side==="SELL"&&market.rsi<=profile.rsiSell){f5Sub="RSI";block("F5","IGNORE",`RSI ${market.rsi} ≤ ${profile.rsiSell}`)}else if(market.aiScore<profile.aiScore){f5Sub="AISCORE";block("F5","IGNORE",`score ${market.aiScore} < ${profile.aiScore}`)}else if(!market.liquidityGrab){f5Sub="LIQGRAB";block("F5","IGNORE","Liquidez/volume não confirmados")}else if(market.fomoDisplacement>profile.fomo)block("F6","FOMO_BLOCKED",`Desl. ${market.fomoDisplacement}% > ${profile.fomo}%`);if(shutdown)verdict="EMERGENCY_SHUTDOWN";if(blockedAt){const o:FilterKey[]=["F1","F2","F3","F4","F5","F6"],i=o.indexOf(blockedAt);for(let j=i+1;j<o.length;j++)filters[o[j]]=false}return{id:`tk_${Date.now()}`,ts:Date.now(),pair,side:market.side,channelZone:market.channelZone,rsi:market.rsi,aiScore:market.aiScore,liquidityGrab:market.liquidityGrab,fomoDisplacement:market.fomoDisplacement,profileId:profile.id,rsiBuy:profile.rsiBuy,rsiSell:profile.rsiSell,aiScoreMin:profile.aiScore,fomoLimit:profile.fomo,slotsUsed,filters,blockedAt,f5Sub,verdict,detail}}

export function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
