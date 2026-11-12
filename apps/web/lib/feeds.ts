"use client";

import type { FeedSpec } from "@socialonchain/feed-sdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clientConfig } from "@/configs";
import { api, qs } from "./api";
import { useSession } from "./session";
import type { SavedFeed, Settings } from "./types";

export type FeedCatalog = {
  defaults: { id: string; spec: FeedSpec; subscribers?: number }[];
  moderation: { id: string; spec: FeedSpec }[];
  public: SavedFeed[];
  mine: SavedFeed[];
};

/** Danh mục feed (mặc định, của tôi, cộng đồng) + map id → tên. */
export function useFeedCatalog() {
  const { owner } = useSession();
  const q = useQuery({
    queryKey: ["feeds", owner],
    queryFn: () => api<FeedCatalog>(`/feeds${qs({ viewer: owner?.toLowerCase() })}`),
  });
  const names = new Map<string, string>();
  for (const f of q.data?.defaults ?? []) names.set(f.id, f.spec.name);
  for (const f of q.data?.moderation ?? []) names.set(f.id, f.spec.name);
  for (const f of [...(q.data?.public ?? []), ...(q.data?.mine ?? [])]) names.set(f.id, f.name);
  return { ...q, names };
}

/** Tab feed của người dùng (lưu trong settings), mặc định theo config client. */
export function useMyTabs(): string[] {
  const { me } = useSession();
  const saved = me?.settings?.feeds;
  return saved && saved.length > 0 ? saved : clientConfig.defaultFeeds;
}

export function useMyModeration(): string[] {
  const { me } = useSession();
  return me?.settings?.moderation ?? clientConfig.defaultModeration;
}

/** PUT /me/settings rồi làm mới `me` + danh mục feed. */
export function useUpdateSettings() {
  const qc = useQueryClient();
  return async (
    patch: Partial<Pick<Settings, "feeds" | "moderation" | "mutedAuthors" | "locale" | "analyticsOptOut">>,
  ) => {
    const r = await api<Settings>("/me/settings", { method: "PUT", json: patch });
    await qc.invalidateQueries({ queryKey: ["me"] });
    await qc.invalidateQueries({ queryKey: ["feed"] });
    await qc.invalidateQueries({ queryKey: ["feeds"] });
    return r;
  };
}
