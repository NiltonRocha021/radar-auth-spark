import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBinanceAccount, validateBinanceOrder } from "../binance.server";

const credentials = {
  apiKey: "test-key",
  apiSecret: "test-secret",
  environment: "testnet" as const,
  baseUrl: "https://testnet.binance.vision",
};

afterEach(() => vi.unstubAllGlobals());

describe("Binance account snapshot", () => {
  it("calculates wallet, available, locked and pending order values", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        canTrade: true,
        balances: [
          { asset: "USDT", free: "100", locked: "20" },
          { asset: "BTC", free: "0.01", locked: "0" },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { symbol: "BTCUSDT", price: "50000", origQty: "0.01", executedQty: "0.004" },
      ]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ price: "50000" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchBinanceAccount(credentials);

    expect(result.canTrade).toBe(true);
    expect(result.walletValueUsdt).toBe(620);
    expect(result.availableValueUsdt).toBe(600);
    expect(result.lockedValueUsdt).toBe(20);
    expect(result.openOrderValueUsdt).toBe(300);
    expect(result.balances.map((balance) => balance.asset)).toEqual(["BTC", "USDT"]);
  });

  it("accepts Binance's empty success response for a test order", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(validateBinanceOrder({ symbol: "BTCUSDT", side: "BUY", quoteAmount: 10 }, credentials)).resolves.toBeUndefined();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/v3/order/test?");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("quoteOrderQty=10");
  });
});