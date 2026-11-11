import { describe, expect, it } from "vitest";
import { FixtureFarcaster, NeynarFarcaster } from "./index";

const raw = {
  users: [
    {
      fid: 1,
      username: "alice",
      display_name: "Alice",
      addresses: ["0xAAaa000000000000000000000000000000000001"],
    },
    { fid: 2, username: "bob" },
  ],
  following: { "1": [2] },
  casts: [
    { fid: 2, text: "hello avalanche", channel: "avalanche", minutes_ago: 10 },
    { fid: 1, text: "older", minutes_ago: 60, likes: 2, recasts: 1 },
  ],
};

describe("FixtureFarcaster", () => {
  const fc = new FixtureFarcaster(raw, 1_000_000);
  it("maps users, follows, casts", async () => {
    expect((await fc.userByUsername("@Alice"))?.addresses).toEqual([
      "0xaaaa000000000000000000000000000000000001",
    ]);
    expect((await fc.following(1)).map((u) => u.username)).toEqual(["bob"]);
    expect((await fc.followingFeed(1)).map((c) => c.text)).toEqual(["hello avalanche"]);
    expect((await fc.channelFeed("avalanche"))[0]?.createdAt).toBe(1_000_000 - 600);
    const byAddr = await fc.usersByAddress(["0xaaaa000000000000000000000000000000000001"]);
    expect(byAddr.get("0xaaaa000000000000000000000000000000000001")?.fid).toBe(1);
    expect(fc.allCasts().find((c) => c.text === "older")?.reactions).toBe(3);
  });
});

describe("NeynarFarcaster (mocked fetch)", () => {
  it("parses channel feed and sends api key", async () => {
    let seen: Request | URL | string | undefined;
    let headers: RequestInit["headers"] | undefined;
    const fetchImpl = (async (url: URL, init?: RequestInit) => {
      seen = url;
      headers = init?.headers;
      return new Response(
        JSON.stringify({
          casts: [
            {
              hash: "0xABC",
              author: { fid: 9, username: "x", verified_addresses: { eth_addresses: ["0xF00"] } },
              text: "hi",
              timestamp: "2026-01-01T00:00:00.000Z",
              channel: { id: "avalanche" },
              reactions: { likes_count: 3, recasts_count: 1 },
              replies: { count: 2 },
            },
          ],
        }),
      );
    }) as unknown as typeof fetch;
    const n = new NeynarFarcaster("k", "https://api.neynar.com", fetchImpl);
    const casts = await n.channelFeed("avalanche");
    expect(String(seen)).toContain("/v2/farcaster/feed/channels/?channel_ids=avalanche");
    expect((headers as Record<string, string>)["x-api-key"]).toBe("k");
    expect(casts[0]).toMatchObject({ hash: "0xabc", channel: "avalanche", reactions: 4, replies: 2 });
    expect(casts[0]?.author.addresses).toEqual(["0xf00"]);
  });
});
