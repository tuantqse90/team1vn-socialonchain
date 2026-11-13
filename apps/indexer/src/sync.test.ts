import { HttpRequestError, InvalidParamsRpcError } from "viem";
import { describe, expect, it } from "vitest";
import { backoffMs, isRateLimited } from "./sync";

describe("indexer: rate limit của RPC công khai", () => {
  it("nhận ra 429 / Cloudflare 1015, kể cả bọc trong cause", () => {
    expect(isRateLimited(new HttpRequestError({ url: "https://rpc", status: 429 }))).toBe(true);
    expect(isRateLimited(new Error("error code: 1015"))).toBe(true);
    expect(isRateLimited(new Error("wrap", { cause: new Error("Too Many Requests") }))).toBe(true);
  });

  it("lỗi range/tham số không phải rate limit (để còn chia nhỏ chunk)", () => {
    expect(isRateLimited(new InvalidParamsRpcError(new Error("block range too large")))).toBe(false);
    expect(isRateLimited(new Error("fetch failed"))).toBe(false);
  });

  it("backoff tăng gấp đôi theo số lần lỗi liên tiếp, tối đa 60 s", () => {
    expect(backoffMs(1000, 1)).toBe(1000);
    expect(backoffMs(1000, 2)).toBe(2000);
    expect(backoffMs(1000, 4)).toBe(8000);
    expect(backoffMs(1000, 20)).toBe(60_000);
  });
});
