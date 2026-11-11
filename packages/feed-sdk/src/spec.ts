import { z } from "zod";
import { LABEL_IDS, type LabelId, SIGNAL_IDS, type SignalId } from "./labels";

export type Condition =
  | { label: LabelId; gte?: number; lte?: number }
  | { signal: SignalId; gte?: number; lte?: number }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

const labelEnum = z.enum(LABEL_IDS as [LabelId, ...LabelId[]]);
const signalEnum = z.enum(SIGNAL_IDS as [SignalId, ...SignalId[]]);

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.strictObject({ label: labelEnum, gte: z.number().optional(), lte: z.number().optional() }),
    z.strictObject({ signal: signalEnum, gte: z.number().optional(), lte: z.number().optional() }),
    z.strictObject({ all: z.array(ConditionSchema).min(1).max(8) }),
    z.strictObject({ any: z.array(ConditionSchema).min(1).max(8) }),
    z.strictObject({ not: ConditionSchema }),
  ]),
);

export const LocalizedTextSchema = z.object({ en: z.string().max(120), vi: z.string().max(120) });

export const RuleSchema = z.strictObject({
  when: ConditionSchema,
  action: z.enum(["boost", "downrank", "hide"]),
  weight: z.number().min(0).max(1).optional(),
  explain: LocalizedTextSchema.optional(),
});
export type Rule = z.infer<typeof RuleSchema>;

/** Nguồn bài: following, replies_in_my_threads, two_hop, self, all, channel:<tên>, farcaster:following, farcaster:channel:<tên> */
export const SourceSchema = z
  .string()
  .regex(
    /^(following|replies_in_my_threads|two_hop|self|all|farcaster:following|channel:[a-z0-9_-]{1,32}|farcaster:channel:[a-z0-9_-]{1,32})$/,
    "invalid source",
  );

export const FeedSpecSchema = z.strictObject({
  v: z.literal(1),
  name: z.string().min(1).max(60),
  description: z.string().max(280).optional(),
  extends: z.string().max(80).nullable().optional(),
  sources: z.array(SourceSchema).min(1).max(12),
  rules: z.array(RuleSchema).max(30),
  recencyHalfLifeHours: z.number().min(1).max(720),
  diversity: z.strictObject({ maxPerAuthor: z.number().int().min(1).max(20) }).optional(),
  explain: z.object({ en: z.array(z.string().max(120)), vi: z.array(z.string().max(120)) }).optional(),
});
export type FeedSpec = z.infer<typeof FeedSpecSchema>;

/** JSON Schema công khai của FeedSpec v1, cho dev bên ngoài và cho prompt của compileFeed. */
export function feedSpecJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(FeedSpecSchema, { unrepresentable: "any" }) as Record<string, unknown>;
}

export function parseFeedSpec(input: unknown): FeedSpec {
  return FeedSpecSchema.parse(input);
}

/** Gộp spec với spec cha (`extends`). Rule của cha chạy trước. Giới hạn độ sâu để tránh vòng lặp. */
export function resolveSpec(
  spec: FeedSpec,
  lookup: (id: string) => FeedSpec | undefined,
  depth = 0,
): FeedSpec {
  if (!spec.extends || depth >= 3) return spec;
  const parent = lookup(spec.extends);
  if (!parent) return spec;
  const resolvedParent = resolveSpec(parent, lookup, depth + 1);
  return { ...spec, rules: [...resolvedParent.rules, ...spec.rules] };
}
