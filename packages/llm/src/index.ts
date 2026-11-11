import Anthropic from "@anthropic-ai/sdk";
import type { LlmCall } from "@socialonchain/feed-sdk";

export type AnthropicLlmOptions = {
  model: string;
  /** Classification nên dùng "low"; biên dịch feed dùng "medium". */
  effort?: "low" | "medium" | "high";
  apiKey?: string;
  /** Server-side refusal fallback (không hỗ trợ trên Haiku). */
  fallbacks?: boolean;
};

export class LlmRefusalError extends Error {}

/**
 * Tạo LlmCall dùng Anthropic SDK. System prompt được cache (prompt caching) vì nó cố định giữa các lần gọi.
 * SDK tự retry 408/409/429/5xx (maxRetries). Lỗi schema do caller (feed-sdk) validate bằng zod và retry.
 */
export function createAnthropicLlm(opts: AnthropicLlmOptions): LlmCall {
  const client = new Anthropic({
    ...(opts.apiKey ? { apiKey: opts.apiKey } : {}),
    maxRetries: 3,
    timeout: 90_000,
  });
  const useFallbacks = opts.fallbacks ?? !opts.model.includes("haiku");

  return async ({ system, user, maxTokens }) => {
    const base = {
      model: opts.model,
      max_tokens: maxTokens ?? 8000,
      system: [{ type: "text" as const, text: system, cache_control: { type: "ephemeral" as const } }],
      messages: [{ role: "user" as const, content: user }],
      output_config: { effort: opts.effort ?? "low" },
    };
    const res = useFallbacks
      ? await client.beta.messages.create({
          ...base,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        })
      : await client.messages.create(base);

    if (res.stop_reason === "refusal") throw new LlmRefusalError("model declined the request");
    if (res.stop_reason === "max_tokens") throw new Error("LLM output truncated (max_tokens)");
    const parts: string[] = [];
    for (const block of res.content) if (block.type === "text") parts.push(block.text);
    return parts.join("");
  };
}

/** Có cấu hình đủ để gọi LLM không (chỉ dựa vào env; ant profile không được dùng trên server). */
export function hasAnthropicKey(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}
