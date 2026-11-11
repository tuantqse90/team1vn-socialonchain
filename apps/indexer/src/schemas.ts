import { z } from "@hono/zod-openapi";

/** Schema REST công khai (interface công khai: muốn đổi thì hỏi trước). */

export const ErrorSchema = z.object({ error: z.string(), message: z.string().optional() }).openapi("Error");

export const AuthorViewSchema = z
  .object({
    address: z.string().nullable(),
    handle: z.string().nullable(),
    displayName: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    registered: z.boolean(),
    fid: z.number().nullable(),
    fcUsername: z.string().nullable(),
    contractsDeployed: z.number().openapi({ description: "Signal onchain_builder (verified)" }),
  })
  .openapi("Author");
export type AuthorView = z.infer<typeof AuthorViewSchema>;

export const PostViewSchema = z
  .object({
    id: z.string().openapi({ example: "oc:0xabc…" }),
    source: z.enum(["onchain", "farcaster"]),
    author: AuthorViewSchema,
    text: z.string(),
    createdAt: z.number(),
    parentId: z.string().nullable(),
    rootId: z.string(),
    channel: z.string().nullable(),
    stats: z.object({ likes: z.number(), reposts: z.number(), replies: z.number() }),
    viewer: z.object({ liked: z.boolean(), reposted: z.boolean() }).nullable(),
    txHash: z.string().nullable(),
    deleted: z.boolean(),
    labels: z.record(z.string(), z.number()),
    /** URL embed (http/https). Bài onchain hiện luôn là []. */
    embeds: z.array(z.string()),
  })
  .openapi("Post");
export type PostView = z.infer<typeof PostViewSchema>;

export const ReasonSchema = z
  .object({
    origin: z.enum(["feed", "moderation"]),
    specName: z.string(),
    ruleIndex: z.number(),
    action: z.enum(["boost", "downrank", "hide"]),
    weight: z.number(),
    text: z.object({ en: z.string(), vi: z.string() }),
  })
  .openapi("Reason");

export const FeedItemSchema = z
  .object({ post: PostViewSchema, score: z.number(), reasons: z.array(ReasonSchema) })
  .openapi("FeedItem");

export const UserViewSchema = z
  .object({
    address: z.string(),
    handle: z.string().nullable(),
    registered: z.boolean(),
    profileUri: z.string(),
    registeredAt: z.number().nullable(),
    profile: z.object({
      displayName: z.string().nullable(),
      bio: z.string().nullable(),
      avatarUrl: z.string().nullable(),
      links: z.array(z.string()),
    }),
    counts: z.object({ followers: z.number(), following: z.number(), posts: z.number() }),
    builder: z
      .object({
        contractsDeployed: z.number(),
        chains: z.record(z.string(), z.number()),
        checkedAt: z.string(),
      })
      .nullable(),
    farcaster: z.object({ fid: z.number(), username: z.string() }).nullable(),
    authorLabels: z.record(z.string(), z.number()),
    viewer: z.object({ following: z.boolean(), followedBy: z.boolean() }).nullable(),
  })
  .openapi("User");
export type UserView = z.infer<typeof UserViewSchema>;

/** Candidate (dữ liệu thuần cho rank() chạy trong trình duyệt). */
export const CandidateSchema = z
  .object({
    id: z.string(),
    author: z.string(),
    createdAt: z.number(),
    origins: z.array(z.string()),
    labels: z.record(z.string(), z.number()),
    authorLabels: z.record(z.string(), z.number()),
    signals: z.record(z.string(), z.number()),
  })
  .openapi("Candidate");
