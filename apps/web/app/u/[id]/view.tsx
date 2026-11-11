"use client";

import { socialGraphAbi } from "@socialonchain/protocol";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Avatar, Button, Empty, Sheet } from "@/components/bits";
import { FeedList } from "@/components/FeedList";
import { Icon } from "@/components/Icon";
import { PersonRow } from "@/components/PersonRow";
import { PostText } from "@/components/PostText";
import { API_URL, ApiError, api, qs } from "@/lib/api";
import { addressUrl, contracts } from "@/lib/chain";
import { compact, shortAddr } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useSessionWrite } from "@/lib/tx";
import type { Author, Post, User } from "@/lib/types";

function toAuthor(u: User): Author {
  return {
    address: u.address,
    handle: u.handle,
    displayName: u.profile.displayName,
    avatarUrl: u.profile.avatarUrl,
    registered: u.registered,
    fid: u.farcaster?.fid ?? null,
    fcUsername: u.farcaster?.username ?? null,
    contractsDeployed: u.builder?.contractsDeployed ?? 0,
  };
}

export function ProfileView({ id }: { id: string }) {
  const t = useTranslations("profile");
  const router = useRouter();
  const { owner, status } = useSession();
  const write = useSessionWrite();
  const viewer = owner?.toLowerCase();
  const [list, setList] = useState<"followers" | "following" | null>(null);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);

  const q = useQuery({
    queryKey: ["user", id, viewer],
    queryFn: () => api<User>(`/users/${encodeURIComponent(id)}${qs({ viewer })}`),
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 1,
  });

  if (q.isPending) {
    return (
      <div className="space-y-3 p-4">
        <div className="skeleton h-20 w-20 rounded-full" />
        <div className="skeleton h-4 w-1/3 rounded" />
        <div className="skeleton h-3 w-2/3 rounded" />
      </div>
    );
  }
  if (q.isError || !q.data) {
    // Địa chỉ chưa đăng ký vẫn có trang (có thể được follow trước).
    const isAddr = /^0x[0-9a-fA-F]{40}$/.test(id);
    return isAddr ? <Empty icon="user" text={t("notRegistered")} /> : <Empty icon="alert" text="404" />;
  }

  const u = q.data;
  const author = toAuthor(u);
  const isMe = viewer === u.address;
  const following = optimistic ?? u.viewer?.following ?? false;
  const followers =
    u.counts.followers + (optimistic === null ? 0 : (optimistic ? 1 : 0) - (u.viewer?.following ? 1 : 0));

  async function toggleFollow() {
    if (status !== "ready" || !contracts || !owner) {
      router.push("/welcome");
      return;
    }
    const next = !following;
    setOptimistic(next);
    const ok = await write(next ? t("follow") : t("following"), {
      address: contracts.SocialGraph,
      abi: socialGraphAbi,
      functionName: next ? "follow" : "unfollow",
      args: [owner, u.address as `0x${string}`],
    });
    if (!ok) setOptimistic(!next);
  }

  const builder = u.builder && u.builder.contractsDeployed > 0 ? u.builder : null;
  const explorer = addressUrl(u.address);

  return (
    <div>
      <section className="px-4 pt-5 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-[24px] font-bold leading-tight tracking-tight">
              {u.profile.displayName || (u.handle ? u.handle : shortAddr(u.address))}
            </h1>
            <div className="mt-0.5 flex items-center gap-2 text-[15px]">
              {u.handle && <span>@{u.handle}</span>}
              <button
                type="button"
                className="mono rounded-full bg-[var(--soft)] px-2 py-0.5 text-[11px] text-[var(--muted)]"
                onClick={() => void navigator.clipboard?.writeText(u.address)}
                title={u.address}
              >
                {shortAddr(u.address)}
              </button>
            </div>
          </div>
          <Avatar author={author} size={72} />
        </div>

        {u.profile.bio && <PostText text={u.profile.bio} className="mt-3" />}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {builder && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)]/10 px-3 py-1 text-[13px] font-medium text-[var(--accent)]"
              title={Object.entries(builder.chains)
                .map(([c, n]) => `chain ${c}: ${n}`)
                .join(" · ")}
              data-testid="builder-badge"
            >
              <Icon name="verified" className="h-4 w-4" />
              {t("contracts", { n: builder.contractsDeployed })}
            </span>
          )}
          {u.farcaster && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--soft)] px-3 py-1 text-[13px]">
              <Icon name="arch" className="h-4 w-4 text-[#8a63d2]" />@{u.farcaster.username}
            </span>
          )}
          {!u.registered && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--soft)] px-3 py-1 text-[13px] text-[var(--muted)]">
              {t("notRegistered")}
            </span>
          )}
          {u.viewer?.followedBy && (
            <span className="rounded-full bg-[var(--soft)] px-3 py-1 text-[13px] text-[var(--muted)]">
              {t("followsYou")}
            </span>
          )}
        </div>

        <div className="mt-3 flex items-center gap-4 text-[14px] text-[var(--muted)]">
          <button
            type="button"
            className="hover:underline"
            onClick={() => setList("followers")}
            data-testid="followers-count"
          >
            <span className="font-semibold text-[var(--ink)]">{compact(followers)}</span> {t("followers")}
          </button>
          <button type="button" className="hover:underline" onClick={() => setList("following")}>
            <span className="font-semibold text-[var(--ink)]">{compact(u.counts.following)}</span>{" "}
            {t("followingCount")}
          </button>
          <span className="flex-1" />
          {explorer && (
            <a
              href={explorer}
              target="_blank"
              rel="noreferrer"
              aria-label="explorer"
              className="hover:text-[var(--ink)]"
            >
              <Icon name="external" className="h-4 w-4" />
            </a>
          )}
          <a
            href={`${API_URL}/users/${u.address}`}
            target="_blank"
            rel="noreferrer"
            aria-label="API"
            title="API"
            className="hover:text-[var(--ink)]"
          >
            <Icon name="cube" className="h-4 w-4" />
          </a>
        </div>

        <div className="mt-4 flex gap-2">
          {isMe ? (
            <Link
              href="/settings#profile"
              className="press flex h-10 flex-1 items-center justify-center rounded-full border border-[var(--line)] text-sm font-semibold"
            >
              {t("edit")}
            </Link>
          ) : (
            <Button
              variant={following ? "outline" : "solid"}
              className="flex-1"
              onClick={() => void toggleFollow()}
              testId="follow"
            >
              {following ? t("following") : t("follow")}
            </Button>
          )}
        </div>
      </section>

      <div className="border-t border-[var(--line)]">
        <FeedList
          queryKey={["user-posts", u.address, viewer]}
          fetchPage={async (cursor) => {
            const r = await api<{ items: Post[]; nextCursor: number | null }>(
              `/users/${u.address}/posts${qs({ cursor, limit: 20, viewer })}`,
            );
            return { rows: r.items.map((post) => ({ post })), nextCursor: r.nextCursor };
          }}
        />
      </div>

      {list && (
        <PeopleSheet
          address={u.address}
          dir={list}
          onClose={() => setList(null)}
          title={list === "followers" ? t("followers") : t("followingCount")}
        />
      )}
    </div>
  );
}

function PeopleSheet({
  address,
  dir,
  onClose,
  title,
}: {
  address: string;
  dir: "followers" | "following";
  onClose: () => void;
  title: string;
}) {
  const q = useQuery({
    queryKey: ["people", address, dir],
    queryFn: () => api<{ items: Author[]; nextCursor: number | null }>(`/users/${address}/${dir}?limit=100`),
  });
  return (
    <Sheet open onClose={onClose} title={title}>
      {q.isPending && <span className="spinner" />}
      <ul className="space-y-1">
        {q.data?.items.map((a) => (
          <li key={a.address ?? a.fid}>
            <PersonRow author={a} onClick={onClose} />
          </li>
        ))}
      </ul>
      {q.data && q.data.items.length === 0 && <Empty icon="user" text="—" />}
    </Sheet>
  );
}
