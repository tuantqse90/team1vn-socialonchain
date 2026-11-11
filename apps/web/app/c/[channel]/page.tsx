"use client";

import { use } from "react";
import { Composer } from "@/components/Compose";
import { FeedList } from "@/components/FeedList";
import { Icon } from "@/components/Icon";
import { clientConfig } from "@/configs";
import { api, qs } from "@/lib/api";
import { useMyModeration } from "@/lib/feeds";
import { useSession } from "@/lib/session";
import type { FeedPage } from "@/lib/types";

export default function ChannelPage({ params }: { params: Promise<{ channel: string }> }) {
  const { channel: raw } = use(params);
  const channel = decodeURIComponent(raw)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 32);
  const { owner, status, token } = useSession();
  const moderation = useMyModeration();
  const withFc = clientConfig.enabledSources.some((s) => s.startsWith("farcaster"));
  const spec = {
    v: 1,
    name: `#${channel}`,
    sources: [`channel:${channel}`, ...(withFc ? [`farcaster:channel:${channel}`] : [])],
    rules: [],
    recencyHalfLifeHours: 48,
  };
  return (
    <div>
      <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--soft)]">
          <Icon name="hash" className="h-5 w-5" />
        </span>
        <h1 className="text-[20px] font-bold tracking-tight">{channel}</h1>
      </div>
      {status === "ready" && (
        <div className="border-b border-[var(--line)] px-4 py-3">
          <Composer channel={channel} compact />
        </div>
      )}
      <FeedList
        queryKey={["channel", channel, owner, token ? "a" : "n"]}
        fetchPage={async (cursor) => {
          const r = await api<FeedPage>(
            `/feed${qs({
              spec: JSON.stringify(spec),
              viewer: owner?.toLowerCase(),
              cursor,
              limit: 20,
              moderation: token ? undefined : moderation.join(","),
            })}`,
          );
          return {
            rows: r.items.map((i) => ({ post: i.post, reasons: i.reasons })),
            nextCursor: r.nextCursor,
          };
        }}
      />
    </div>
  );
}
