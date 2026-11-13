import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Schema `chain`: CHỈ chứa dữ liệu dựng lại được từ event onchain (`pnpm indexer:replay`).
 * Mọi địa chỉ lưu chữ thường. Thời gian onchain lưu unix giây (integer/bigint).
 */
export const chain = pgSchema("chain");

export const indexerState = chain.table("indexer_state", {
  id: text("id").primaryKey(), // `${chainId}:${version}`
  chainId: integer("chain_id").notNull(),
  lastBlock: bigint("last_block", { mode: "number" }).notNull(),
  headBlock: bigint("head_block", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = chain.table(
  "users",
  {
    address: text("address").primaryKey(),
    handle: text("handle"),
    profileUri: text("profile_uri").notNull().default(""),
    registeredAt: bigint("registered_at", { mode: "number" }).notNull(),
    blockNumber: bigint("block_number", { mode: "number" }).notNull(),
  },
  (t) => [uniqueIndex("users_handle_idx").on(t.handle)],
);

export const delegates = chain.table(
  "delegates",
  {
    owner: text("owner").notNull(),
    key: text("key").notNull(),
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
    addedAt: bigint("added_at", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.owner, t.key] }), index("delegates_key_idx").on(t.key)],
);

export const follows = chain.table(
  "follows",
  {
    follower: text("follower").notNull(),
    target: text("target").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.follower, t.target] }), index("follows_target_idx").on(t.target)],
);

export const posts = chain.table(
  "posts",
  {
    id: text("id").primaryKey(), // oc:0x…
    author: text("author").notNull(),
    parentId: text("parent_id"), // oc:0x… | null
    rootId: text("root_id").notNull(), // gốc thread (= id nếu không phải reply)
    channel: text("channel"), // bytes32 hex | null
    text: text("text").notNull(),
    meta: text("meta").notNull().default("0x"),
    mentions: text("mentions").array().notNull().default(sql`'{}'::text[]`),
    hashtags: text("hashtags").array().notNull().default(sql`'{}'::text[]`),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    blockNumber: bigint("block_number", { mode: "number" }).notNull(),
    txHash: text("tx_hash").notNull(),
    deleted: boolean("deleted").notNull().default(false),
  },
  (t) => [
    index("posts_author_idx").on(t.author, t.createdAt),
    index("posts_parent_idx").on(t.parentId),
    index("posts_root_idx").on(t.rootId),
    index("posts_channel_idx").on(t.channel, t.createdAt),
    index("posts_created_idx").on(t.createdAt),
  ],
);

export const reactions = chain.table(
  "reactions",
  {
    actor: text("actor").notNull(),
    postId: text("post_id").notNull(),
    kind: integer("kind").notNull(), // 1 like, 2 repost
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.actor, t.postId, t.kind] }), index("reactions_post_idx").on(t.postId)],
);

export const payments = chain.table(
  "payments",
  {
    id: text("id").primaryKey(), // txHash:logIndex
    user: text("user").notNull(),
    planId: integer("plan_id").notNull(),
    amount: text("amount").notNull(), // uint256 dạng chuỗi
    paidUntil: bigint("paid_until", { mode: "number" }).notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    txHash: text("tx_hash").notNull(),
  },
  (t) => [index("payments_user_idx").on(t.user, t.planId)],
);

/**
 * Schema `app`: dữ liệu offchain (nhãn, Farcaster cache, quota, thông báo…). PHẢI backup.
 */
export const app = pgSchema("app");

export const fcUsers = app.table("fc_users", {
  fid: integer("fid").primaryKey(),
  username: text("username").notNull(),
  displayName: text("display_name"),
  pfpUrl: text("pfp_url"),
  bio: text("bio"),
  addresses: text("addresses").array().notNull().default(sql`'{}'::text[]`),
  followerCount: integer("follower_count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fcPosts = app.table(
  "fc_posts",
  {
    id: text("id").primaryKey(), // fc:0x…
    fid: integer("fid").notNull(),
    authorAddress: text("author_address"), // verified ETH address đầu tiên nếu có
    text: text("text").notNull(),
    channel: text("channel"),
    parentId: text("parent_id"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    reactions: integer("reactions").notNull().default(0),
    replies: integer("replies").notNull().default(0),
    /** URL embed (http/https), tối đa 4. */
    embeds: text("embeds").array().notNull().default(sql`'{}'::text[]`),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("fc_posts_fid_idx").on(t.fid, t.createdAt),
    index("fc_posts_channel_idx").on(t.channel, t.createdAt),
    index("fc_posts_created_idx").on(t.createdAt),
  ],
);

/** Farcaster following: fid → targetFid. Dùng cho source `farcaster:following`. */
export const fcLinks = app.table(
  "fc_links",
  {
    fid: integer("fid").notNull(),
    targetFid: integer("target_fid").notNull(),
  },
  (t) => [primaryKey({ columns: [t.fid, t.targetFid] })],
);

/** Liên kết user native ↔ FID (qua verified address của Farcaster). */
export const userFc = app.table("user_fc", {
  address: text("address").primaryKey(),
  fid: integer("fid").notNull(),
  linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
});

export const labelBatches = app.table("label_batches", {
  digest: text("digest").primaryKey(),
  labeler: text("labeler").notNull(),
  issuedAt: bigint("issued_at", { mode: "number" }).notNull(),
  signature: text("signature").notNull(),
  items: integer("items").notNull(),
  /** Batch gốc đúng như labeler đã ký, để bên thứ ba tự verify qua `GET /labels?since=`. */
  payload: jsonb("payload"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export const labels = app.table(
  "labels",
  {
    postId: text("post_id").notNull(),
    label: text("label").notNull(),
    score: real("score").notNull(),
    labeler: text("labeler").notNull(),
    batch: text("batch").notNull(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.label, t.labeler] }), index("labels_label_idx").on(t.label)],
);

/** Nhãn tác giả. `subject` = địa chỉ (0x…) hoặc `fid:<n>` khi tác giả Farcaster chưa có địa chỉ. */
export const authorLabels = app.table(
  "author_labels",
  {
    subject: text("subject").notNull(),
    label: text("label").notNull(),
    score: real("score").notNull(),
    labeler: text("labeler").notNull(),
    batch: text("batch").notNull(),
  },
  (t) => [primaryKey({ columns: [t.subject, t.label, t.labeler] })],
);

export const builderStats = app.table("builder_stats", {
  address: text("address").primaryKey(),
  contractsDeployed: integer("contracts_deployed").notNull(),
  chains: jsonb("chains").$type<Record<string, number>>().notNull().default({}),
  source: text("source").notNull(), // fixture | data-api | routescan
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
});

export const savedFeeds = app.table(
  "saved_feeds",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    spec: jsonb("spec").notNull(),
    nlText: text("nl_text"),
    isPublic: boolean("is_public").notNull().default(true),
    forkedFrom: text("forked_from"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("saved_feeds_owner_idx").on(t.owner)],
);

export const userSettings = app.table("user_settings", {
  address: text("address").primaryKey(),
  feeds: text("feeds").array().notNull().default(sql`'{}'::text[]`), // tab feed theo thứ tự
  moderation: text("moderation").array().notNull().default(sql`'{mod:safety}'::text[]`),
  mutedAuthors: text("muted_authors").array().notNull().default(sql`'{}'::text[]`),
  /** Kênh đã tham gia (offchain, chỉ để lọc/đếm thành viên; không có trên chain). */
  channels: text("channels").array().notNull().default(sql`'{}'::text[]`),
  locale: text("locale").notNull().default("en"),
  analyticsOptOut: boolean("analytics_opt_out").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Đếm lượt dùng theo ngày (UTC) cho quota. kind: compile | custom_label */
export const usage = app.table(
  "usage",
  {
    address: text("address").notNull(),
    day: text("day").notNull(), // YYYY-MM-DD
    kind: text("kind").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.address, t.day, t.kind] })],
);

/** Cache kết quả compileFeed theo hash input (không tính quota khi trúng cache). */
export const compileCache = app.table("compile_cache", {
  hash: text("hash").primaryKey(),
  result: jsonb("result").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = app.table(
  "notifications",
  {
    id: serial("id").primaryKey(),
    recipient: text("recipient").notNull(),
    kind: text("kind").notNull(), // follow | reply | like | repost | mention
    actor: text("actor").notNull(),
    postId: text("post_id"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [
    index("notifications_recipient_idx").on(t.recipient, t.createdAt),
    unique("notifications_dedup").on(t.recipient, t.kind, t.actor, t.postId).nullsNotDistinct(),
  ],
);

export const reports = app.table(
  "reports",
  {
    id: serial("id").primaryKey(),
    reporter: text("reporter").notNull(),
    postId: text("post_id").notNull(),
    reason: text("reason").notNull(), // illegal | spam | harassment | doxxing | nsfw | other
    note: text("note"),
    status: text("status").notNull().default("open"), // open | actioned | dismissed
    resolvedBy: text("resolved_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("reports_status_idx").on(t.status, t.createdAt)],
);

/** Danh sách chặn của NGƯỜI VẬN HÀNH client (tầng 2). subject = post id hoặc địa chỉ. */
export const blocklist = app.table("blocklist", {
  subject: text("subject").primaryKey(),
  kind: text("kind").notNull(), // post | author
  reason: text("reason").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Người được follow trên Farcaster nhưng chưa có verified address: lưu offchain. */
export const pendingFollows = app.table(
  "pending_follows",
  {
    owner: text("owner").notNull(),
    targetFid: integer("target_fid").notNull(),
    username: text("username").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.owner, t.targetFid] })],
);

/** Profile offchain (tên hiển thị, bio, avatar). profileURI onchain trỏ về đây; không đưa PII lên chain. */
export const profiles = app.table("profiles", {
  address: text("address").primaryKey(),
  displayName: text("display_name"),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  links: jsonb("links").$type<string[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Đo lường sản phẩm, ẩn danh (address được băm). */
export const events = app.table(
  "events",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    subject: text("subject"), // hash(address)
    props: jsonb("props").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("events_name_idx").on(t.name, t.createdAt),
    index("events_subject_idx").on(t.subject, t.createdAt),
  ],
);

export const workerState = app.table("worker_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Tin nhắn riêng (DM) mã hoá đầu cuối, KHÔNG lên chain. Server chỉ giữ ciphertext + metadata.
 * Khoá công khai nhắn tin do owner ký xác nhận; giữ cả lịch sử để giải mã tin cũ sau khi đổi khoá.
 */
export const dmKeys = app.table(
  "dm_keys",
  {
    address: text("address").notNull(),
    publicKey: text("public_key").notNull(),
    signature: text("signature").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.address, t.publicKey] }),
    index("dm_keys_addr_idx").on(t.address, t.createdAt),
  ],
);

export const dmMessages = app.table(
  "dm_messages",
  {
    id: serial("id").primaryKey(),
    pair: text("pair").notNull(), // `${min(a,b)}:${max(a,b)}`
    sender: text("sender").notNull(),
    recipient: text("recipient").notNull(),
    senderKey: text("sender_key").notNull(),
    recipientKey: text("recipient_key").notNull(),
    nonce: text("nonce").notNull(),
    ciphertext: text("ciphertext").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("dm_messages_pair_idx").on(t.pair, t.id),
    index("dm_messages_sender_idx").on(t.sender, t.createdAt),
  ],
);

/** Trạng thái hộp thư theo từng người: (owner, peer). state: open | accepted | declined. */
export const dmThreads = app.table(
  "dm_threads",
  {
    owner: text("owner").notNull(),
    peer: text("peer").notNull(),
    state: text("state").notNull().default("open"),
    lastMessageId: integer("last_message_id").notNull().default(0),
    lastIncomingId: integer("last_incoming_id").notNull().default(0),
    lastReadId: integer("last_read_id").notNull().default(0),
    /** Số tin owner đã gửi trong thread này (giới hạn tin khi người kia chưa chấp nhận). */
    sentCount: integer("sent_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.owner, t.peer] }),
    index("dm_threads_owner_idx").on(t.owner, t.lastMessageId),
  ],
);

/**
 * Tài khoản trong app (ví nhúng: tên + mật khẩu, không cần ví ngoài). Server KHÔNG giải mã được ví:
 * chỉ giữ keystore đã mã hoá ở client + sha256(authKey). Quên mật khẩu = mất tài khoản.
 * `address`, `handle` lưu chữ thường. `drip_tx`: tx tặng gas lần đầu (null nếu không tặng).
 */
export const accounts = app.table("accounts", {
  address: text("address").primaryKey(),
  handle: text("handle").notNull().unique(),
  kdf: jsonb("kdf")
    .$type<{ name: "scrypt"; N: number; r: number; p: number; dkLen: 64; salt: string }>()
    .notNull(),
  authHash: text("auth_hash").notNull(),
  keystore: jsonb("keystore").$type<{ v: 1; iv: string; ct: string }>().notNull(),
  dripTx: text("drip_tx"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Ví ngoài (vd. ví deployer) đã liên kết vào tài khoản bằng chữ ký của chính ví đó (linkWalletMessage).
 * Worker cộng số contract các ví này deploy vào `builder_stats` của owner (tín hiệu `onchain_builder`).
 * Mỗi ví chỉ thuộc 1 owner; liên kết lại với chữ ký hợp lệ thì chuyển sang owner mới. Địa chỉ lưu chữ thường.
 */
export const linkedWallets = app.table(
  "linked_wallets",
  {
    address: text("address").primaryKey(),
    owner: text("owner").notNull(),
    signature: text("signature").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("linked_wallets_owner_idx").on(t.owner)],
);
