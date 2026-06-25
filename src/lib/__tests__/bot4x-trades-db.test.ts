// Cobre o caminho de persistência de trades: mapeamento snake_case <-> camelCase,
// outbox pattern (PK-scoped, sem filtro JSONB), e tratamento de erros.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Trade } from "../bot4x-data";

// ---------- supabase mock ----------
type Builder = {
  upsert: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  __upsertResult: { error: unknown };
  __insertResult: { data: unknown; error: unknown };
  __updateResult: { error: unknown };
  __selectResult: { data: unknown; error: unknown };
  __deleteResult: { error: unknown };
};

function makeBuilder(): Builder {
  const b = {} as Builder;
  b.__upsertResult = { error: null };
  b.__insertResult = { data: { id: "outbox-1" }, error: null };
  b.__updateResult = { error: null };
  b.__selectResult = { data: [], error: null };
  b.__deleteResult = { error: null };

  // upsert: termina a chain, retorna promise
  b.upsert = vi.fn(() => Promise.resolve(b.__upsertResult));

  // insert(...).select("id").single() => result
  b.single = vi.fn(() => Promise.resolve(b.__insertResult));
  b.select = vi.fn((arg?: string) => {
    // select sem args termina chain (loadTrades faz .select("*").eq.gte.order.limit)
    if (arg === "id") {
      return { single: b.single } as unknown as Builder;
    }
    return b;
  });
  b.insert = vi.fn(() => ({ select: b.select } as unknown as Builder));

  // update(...).eq(...) => promise
  b.update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve(b.__updateResult)) }));

  // delete().eq().eq() => promise
  b.delete = vi.fn(() => ({
    eq: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve(b.__deleteResult)) })),
  }));

  // chain de leitura: select("*").eq.gte.order.limit
  b.limit = vi.fn(() => Promise.resolve(b.__selectResult));
  b.order = vi.fn(() => ({ limit: b.limit } as unknown as Builder));
  b.gte = vi.fn(() => ({ order: b.order } as unknown as Builder));
  b.eq = vi.fn(() => ({ gte: b.gte } as unknown as Builder));

  return b;
}

const { builder, fromMock } = vi.hoisted(() => {
  // Definido dentro de vi.hoisted para ficar disponível no factory de vi.mock,
  // que é içado para o topo do arquivo.
  const mk = () => {
    const b: Record<string, unknown> = {};
    b.__upsertResult = { error: null };
    b.__insertResult = { data: { id: "outbox-1" }, error: null };
    b.__updateResult = { error: null };
    b.__selectResult = { data: [], error: null };
    b.__deleteResult = { error: null };
    return b;
  };
  const b = mk();
  return { builder: b, fromMock: { current: null as unknown as ReturnType<typeof Object> } };
});

// Reconstrói o builder com mocks "reais" do vitest (fora do hoisted, que roda antes do vi).
function wireBuilder() {
  builder.upsert = vi.fn(() => Promise.resolve(builder.__upsertResult));
  builder.single = vi.fn(() => Promise.resolve(builder.__insertResult));
  builder.select = vi.fn((arg?: string) => {
    if (arg === "id") return { single: builder.single };
    return builder;
  });
  builder.insert = vi.fn(() => ({ select: builder.select }));
  builder.update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve(builder.__updateResult)) }));
  builder.delete = vi.fn(() => ({
    eq: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve(builder.__deleteResult)) })),
  }));
  builder.limit = vi.fn(() => Promise.resolve(builder.__selectResult));
  builder.order = vi.fn(() => ({ limit: builder.limit }));
  builder.gte = vi.fn(() => ({ order: builder.order }));
  builder.eq = vi.fn(() => ({ gte: builder.gte }));
}
wireBuilder();
const fromImpl = vi.fn(() => builder);
fromMock.current = fromImpl;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => fromMock.current(...args) },
}));


vi.mock("../logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { saveTrade, saveTradeWithOutbox, loadTrades } from "../bot4x-trades-db";

const baseTrade: Trade = {
  id: "trade-abc",
  day: "2026-06-25",
  pair: "BTC/USDT",
  side: "LONG",
  entry: 100,
  stop: 95,
  target: 110,
  result: "WIN",
  pnl: 10,
  pnlPct: 0.1,
  accumulated: 50,
  profile: "conservador",
  leverage: 3,
  motivo: "ok",
  hour: 12,
};

beforeEach(() => {
  fromMock.mockClear();
  builder.upsert.mockClear();
  builder.insert.mockClear();
  builder.update.mockClear();
  builder.select.mockClear();
  builder.single.mockClear();
  builder.eq.mockClear();
  builder.__upsertResult = { error: null };
  builder.__insertResult = { data: { id: "outbox-1" }, error: null };
  builder.__updateResult = { error: null };
  builder.__selectResult = { data: [], error: null };
});

describe("saveTrade", () => {
  it("faz upsert com colunas snake_case mapeadas do Trade", async () => {
    await saveTrade("user-1", baseTrade);
    expect(fromMock).toHaveBeenCalledWith("bot4x_trades");
    const payload = builder.upsert.mock.calls[0][0];
    expect(payload).toMatchObject({
      id: "trade-abc",
      user_id: "user-1",
      day: "2026-06-25",
      pair: "BTC/USDT",
      side: "LONG",
      entry: 100,
      stop: 95,
      target: 110,
      result: "WIN",
      pnl: 10,
      pnl_pct: 0.1,
      accumulated: 50,
      profile: "conservador",
      leverage: 3,
      motivo: "ok",
      hour: 12,
    });
    // upsert deve usar onConflict por PK
    expect(builder.upsert.mock.calls[0][1]).toEqual({ onConflict: "id" });
  });

  it("lança Error contendo tradeId quando supabase retorna erro", async () => {
    builder.__upsertResult = { error: { message: "db down", code: "X", details: "", hint: "" } };
    await expect(saveTrade("user-1", baseTrade)).rejects.toThrow(/trade-abc/);
  });
});

describe("saveTradeWithOutbox", () => {
  it("insere no outbox, executa saveTrade e marca processed pelo PK do outbox", async () => {
    await saveTradeWithOutbox("user-1", baseTrade);

    // 1) insert no trade_outbox
    expect(fromMock).toHaveBeenNthCalledWith(1, "trade_outbox");
    expect(builder.insert).toHaveBeenCalledTimes(1);
    expect(builder.insert.mock.calls[0][0]).toMatchObject({
      user_id: "user-1",
      status: "pending",
    });
    // 2) saveTrade direto em bot4x_trades
    expect(fromMock).toHaveBeenNthCalledWith(2, "bot4x_trades");
    expect(builder.upsert).toHaveBeenCalledTimes(1);
    // 3) update do outbox marcando processed — filtrando pelo PK retornado
    expect(fromMock).toHaveBeenNthCalledWith(3, "trade_outbox");
    expect(builder.update).toHaveBeenCalledTimes(1);
    const updatePayload = builder.update.mock.calls[0][0];
    expect(updatePayload.status).toBe("processed");
    expect(updatePayload.processed_at).toEqual(expect.any(String));
    // Confirma que o eq encadeado após update recebeu o PK da linha
    const eqMock = builder.update.mock.results[0].value.eq as ReturnType<typeof vi.fn>;
    expect(eqMock).toHaveBeenCalledWith("id", "outbox-1");
  });

  it("falha no insert do outbox: lança e NÃO chama saveTrade", async () => {
    builder.__insertResult = { data: null, error: { message: "outbox fail" } };
    await expect(saveTradeWithOutbox("user-1", baseTrade)).rejects.toBeTruthy();
    expect(builder.upsert).not.toHaveBeenCalled();
  });
});

describe("loadTrades", () => {
  it("mapeia snake_case do banco para camelCase do Trade", async () => {
    builder.__selectResult = {
      data: [
        {
          id: "t1",
          day: "2026-06-25",
          pair: "ETH/USDT",
          side: "SHORT",
          entry: "200",
          stop: "210",
          target: "180",
          result: "LOSS",
          pnl: "-10",
          pnl_pct: "-0.05",
          accumulated: "40",
          profile: "rsi",
          leverage: 5,
          motivo: "stop",
          hour: 9,
        },
      ],
      error: null,
    };
    const trades = await loadTrades("user-1");
    expect(trades).toHaveLength(1);
    expect(trades[0]).toEqual({
      id: "t1",
      day: "2026-06-25",
      pair: "ETH/USDT",
      side: "SHORT",
      entry: 200,
      stop: 210,
      target: 180,
      result: "LOSS",
      pnl: -10,
      pnlPct: -0.05,
      accumulated: 40,
      profile: "rsi",
      leverage: 5,
      motivo: "stop",
      hour: 9,
    });
  });

  it("retorna [] (e não lança) quando supabase retorna erro", async () => {
    builder.__selectResult = { data: null, error: { message: "boom" } };
    await expect(loadTrades("user-1")).resolves.toEqual([]);
  });
});
