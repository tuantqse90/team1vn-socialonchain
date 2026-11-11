import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256, toBytes } from "viem";
import { z } from "zod";

/** Đọc Farcaster (CHỈ ĐỌC). Hai chế độ: `fixture` (không cần key) và `neynar` (cần NEYNAR_API_KEY). */

export type FcUser = {
  fid: number;
  username: string;
  displayName: string | null;
  pfpUrl: string | null;
  bio: string | null;
  /** Verified ETH addresses, chữ thường. */
  addresses: string[];
  followerCount: number;
};

export type FcCast = {
  hash: string;
  author: FcUser;
  text: string;
  channel: string | null;
  parentHash: string | null;
  createdAt: number; // unix giây
  reactions: number;
  replies: number;
  /** URL embed (ảnh, link), chỉ http(s), tối đa MAX_EMBEDS. Embed dạng quote-cast chưa hỗ trợ. */
  embeds: string[];
};

export const MAX_EMBEDS = 4;

/** Chỉ giữ URL http(s) hợp lệ, bỏ trùng, cắt còn MAX_EMBEDS. */
export function cleanEmbeds(urls: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const u of urls) {
    if (!u || u.length > 2048) continue;
    try {
      const url = new URL(u);
      if (url.protocol !== "https:" && url.protocol !== "http:") continue;
      if (!out.includes(url.href)) out.push(url.href);
    } catch {
      // bỏ URL hỏng
    }
    if (out.length >= MAX_EMBEDS) break;
  }
  return out;
}

export interface FarcasterSource {
  readonly mode: "fixture" | "neynar";
  userByUsername(username: string): Promise<FcUser | null>;
  userByFid(fid: number): Promise<FcUser | null>;
  /** Tìm user Farcaster theo verified address. */
  usersByAddress(addresses: string[]): Promise<Map<string, FcUser>>;
  following(fid: number, limit?: number): Promise<FcUser[]>;
  followingFeed(fid: number, limit?: number): Promise<FcCast[]>;
  channelFeed(channel: string, limit?: number): Promise<FcCast[]>;
}

// ---------------- Fixture ----------------

const FixtureUser = z.looseObject({
  fid: z.number().int(),
  username: z.string(),
  display_name: z.string().nullish(),
  bio: z.string().nullish(),
  pfp_url: z.string().nullish(),
  addresses: z.array(z.string()).nullish(),
  verified_addresses: z.array(z.string()).nullish(),
  follower_count: z.number().nullish(),
});

const FixtureCast = z.looseObject({
  hash: z.string().nullish(),
  fid: z.number().int(),
  text: z.string(),
  channel: z.string().nullish(),
  minutes_ago: z.number(),
  parent_hash: z.string().nullish(),
  likes: z.number().nullish(),
  recasts: z.number().nullish(),
  reactions: z.number().nullish(),
  replies: z.number().nullish(),
  embeds: z.array(z.string()).nullish(),
});

const FixtureSchema = z.looseObject({
  users: z.array(FixtureUser),
  following: z.record(z.string(), z.array(z.number().int())).default({}),
  casts: z.array(FixtureCast),
});

export function defaultFixturePath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/farcaster/fixture.json");
}

export class FixtureFarcaster implements FarcasterSource {
  readonly mode = "fixture" as const;
  private users = new Map<number, FcUser>();
  private casts: FcCast[] = [];
  private follows = new Map<number, number[]>();

  constructor(raw: unknown, now = Math.floor(Date.now() / 1000)) {
    const data = FixtureSchema.parse(raw);
    for (const u of data.users) {
      this.users.set(u.fid, {
        fid: u.fid,
        username: u.username,
        displayName: u.display_name ?? null,
        pfpUrl: u.pfp_url ?? null,
        bio: u.bio ?? null,
        addresses: (u.addresses ?? u.verified_addresses ?? []).map((a) => a.toLowerCase()),
        followerCount: u.follower_count ?? 0,
      });
    }
    for (const [fid, list] of Object.entries(data.following)) this.follows.set(Number(fid), list);
    data.casts.forEach((c, i) => {
      const author = this.users.get(c.fid);
      if (!author) return;
      this.casts.push({
        hash: (c.hash ?? keccak256(toBytes(`fixture:${c.fid}:${i}`)).slice(0, 42)).toLowerCase(),
        author,
        text: c.text,
        channel: c.channel ?? null,
        parentHash: c.parent_hash ?? null,
        createdAt: now - Math.round(c.minutes_ago * 60),
        reactions: c.reactions ?? (c.likes ?? 0) + (c.recasts ?? 0),
        replies: c.replies ?? 0,
        embeds: cleanEmbeds(c.embeds ?? []),
      });
    });
    this.casts.sort((a, b) => b.createdAt - a.createdAt);
  }

  static fromFile(path = defaultFixturePath()): FixtureFarcaster {
    return new FixtureFarcaster(JSON.parse(readFileSync(path, "utf8")));
  }

  allUsers(): FcUser[] {
    return [...this.users.values()];
  }

  allCasts(): FcCast[] {
    return [...this.casts];
  }

  async userByUsername(username: string) {
    const u = username.replace(/^@/, "").toLowerCase();
    return [...this.users.values()].find((x) => x.username.toLowerCase() === u) ?? null;
  }
  async userByFid(fid: number) {
    return this.users.get(fid) ?? null;
  }
  async usersByAddress(addresses: string[]) {
    const want = new Set(addresses.map((a) => a.toLowerCase()));
    const out = new Map<string, FcUser>();
    for (const u of this.users.values()) for (const a of u.addresses) if (want.has(a)) out.set(a, u);
    return out;
  }
  async following(fid: number, limit = 500) {
    return (this.follows.get(fid) ?? [])
      .map((f) => this.users.get(f))
      .filter((u): u is FcUser => Boolean(u))
      .slice(0, limit);
  }
  async followingFeed(fid: number, limit = 100) {
    const set = new Set(this.follows.get(fid) ?? []);
    return this.casts.filter((c) => set.has(c.author.fid)).slice(0, limit);
  }
  async channelFeed(channel: string, limit = 100) {
    return this.casts.filter((c) => c.channel === channel).slice(0, limit);
  }
}

// ---------------- Neynar ----------------
// Endpoint theo docs: https://docs.neynar.com/reference (following, feed following, feed channels, user by_username, user bulk).
// Parser để lỏng (optional) vì chưa chạy thử với API thật.

const NeynarUser = z.looseObject({
  fid: z.number(),
  username: z.string(),
  display_name: z.string().nullish(),
  pfp_url: z.string().nullish(),
  follower_count: z.number().nullish(),
  profile: z.looseObject({ bio: z.looseObject({ text: z.string().nullish() }).nullish() }).nullish(),
  verified_addresses: z.looseObject({ eth_addresses: z.array(z.string()).nullish() }).nullish(),
});

const NeynarCast = z.looseObject({
  hash: z.string(),
  author: NeynarUser,
  text: z.string().default(""),
  timestamp: z.string(),
  parent_hash: z.string().nullish(),
  channel: z.looseObject({ id: z.string() }).nullish(),
  reactions: z
    .looseObject({ likes_count: z.number().nullish(), recasts_count: z.number().nullish() })
    .nullish(),
  replies: z.looseObject({ count: z.number().nullish() }).nullish(),
  // Embed URL có `url`; embed quote-cast (không có `url`) bị bỏ qua.
  embeds: z.array(z.looseObject({ url: z.string().nullish() })).nullish(),
});

function mapUser(u: z.infer<typeof NeynarUser>): FcUser {
  return {
    fid: u.fid,
    username: u.username,
    displayName: u.display_name ?? null,
    pfpUrl: u.pfp_url ?? null,
    bio: u.profile?.bio?.text ?? null,
    addresses: (u.verified_addresses?.eth_addresses ?? []).map((a) => a.toLowerCase()),
    followerCount: u.follower_count ?? 0,
  };
}

function mapCast(c: z.infer<typeof NeynarCast>): FcCast {
  return {
    hash: c.hash.toLowerCase(),
    author: mapUser(c.author),
    text: c.text,
    channel: c.channel?.id ?? null,
    parentHash: c.parent_hash ?? null,
    createdAt: Math.floor(new Date(c.timestamp).getTime() / 1000),
    reactions: (c.reactions?.likes_count ?? 0) + (c.reactions?.recasts_count ?? 0),
    replies: c.replies?.count ?? 0,
    embeds: cleanEmbeds((c.embeds ?? []).map((e) => e.url)),
  };
}

export class NeynarFarcaster implements FarcasterSource {
  readonly mode = "neynar" as const;
  constructor(
    private apiKey: string,
    private base = "https://api.neynar.com",
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async get(path: string, params: Record<string, string | number>): Promise<unknown> {
    const url = new URL(path, this.base);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await this.fetchImpl(url, {
        headers: { "x-api-key": this.apiKey, accept: "application/json" },
      });
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`neynar ${path} ${res.status}`);
      return res.json();
    }
    throw new Error(`neynar ${path} retries exhausted`);
  }

  async userByUsername(username: string) {
    const r = (await this.get("/v2/farcaster/user/by_username", {
      username: username.replace(/^@/, ""),
    })) as {
      user?: unknown;
    } | null;
    return r?.user ? mapUser(NeynarUser.parse(r.user)) : null;
  }

  async userByFid(fid: number) {
    const r = (await this.get("/v2/farcaster/user/bulk", { fids: fid })) as { users?: unknown[] } | null;
    const u = r?.users?.[0];
    return u ? mapUser(NeynarUser.parse(u)) : null;
  }

  async usersByAddress(addresses: string[]) {
    const out = new Map<string, FcUser>();
    for (let i = 0; i < addresses.length; i += 300) {
      const chunk = addresses.slice(i, i + 300);
      const r = (await this.get("/v2/farcaster/user/bulk-by-address", {
        addresses: chunk.join(","),
      })) as Record<string, unknown[]> | null;
      for (const [addr, users] of Object.entries(r ?? {})) {
        const u = Array.isArray(users) ? users[0] : undefined;
        if (u) out.set(addr.toLowerCase(), mapUser(NeynarUser.parse(u)));
      }
    }
    return out;
  }

  async following(fid: number, limit = 500) {
    const out: FcUser[] = [];
    let cursor: string | undefined;
    while (out.length < limit) {
      const r = (await this.get("/v2/farcaster/following/", {
        fid,
        limit: 100,
        ...(cursor ? { cursor } : {}),
      })) as {
        users?: { user?: unknown }[];
        next?: { cursor?: string | null };
      } | null;
      for (const f of r?.users ?? []) if (f.user) out.push(mapUser(NeynarUser.parse(f.user)));
      cursor = r?.next?.cursor ?? undefined;
      if (!cursor || !r?.users?.length) break;
    }
    return out.slice(0, limit);
  }

  async followingFeed(fid: number, limit = 100) {
    const r = (await this.get("/v2/farcaster/feed/", {
      feed_type: "following",
      fid,
      limit: Math.min(limit, 100),
    })) as { casts?: unknown[] } | null;
    return (r?.casts ?? []).map((c) => mapCast(NeynarCast.parse(c)));
  }

  async channelFeed(channel: string, limit = 100) {
    const r = (await this.get("/v2/farcaster/feed/channels/", {
      channel_ids: channel,
      limit: Math.min(limit, 100),
    })) as { casts?: unknown[] } | null;
    return (r?.casts ?? []).map((c) => mapCast(NeynarCast.parse(c)));
  }
}

/** Chọn nguồn theo env. Thiếu key thì luôn rơi về fixture, không chặn tiến độ. */
export function createFarcasterSource(
  env: { FARCASTER_MODE?: string; NEYNAR_API_KEY?: string } = process.env,
): FarcasterSource {
  if (env.FARCASTER_MODE === "neynar" && env.NEYNAR_API_KEY) return new NeynarFarcaster(env.NEYNAR_API_KEY);
  return FixtureFarcaster.fromFile();
}
