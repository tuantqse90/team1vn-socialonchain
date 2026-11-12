"use client";

import { LABELS, type LabelId } from "@socialonchain/feed-sdk";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Empty, Sheet } from "@/components/bits";
import { FeedList } from "@/components/FeedList";
import { useFollow } from "@/components/FollowButton";
import { Icon } from "@/components/Icon";
import { IdCard } from "@/components/IdCard";
import { Segmented } from "@/components/kit";
import motion from "@/components/onboarding/onboarding.module.css";
import { PersonRow } from "@/components/PersonRow";
import { PostText } from "@/components/PostText";
import { RollUp, Seal, ShareButton } from "@/components/profile/bits";
import { ProfileFeeds, useAuthorFeeds } from "@/components/profile/ProfileFeeds";
import { clientConfig } from "@/configs";
import { API_URL, ApiError, api, qs } from "@/lib/api";
import { addressUrl, network } from "@/lib/chain";
import { shortAddr } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { Author, Post, User } from "@/lib/types";

type Tab = "posts" | "replies" | "feeds";
const FC_ENABLED = clientConfig.enabledSources.some((x) => x.startsWith("farcaster"));
const NET = network.name === "fuji" ? "Fuji" : "Local";

/** Tên nhãn chủ đề cho thẻ (bỏ phần giải thích trong ngoặc), viết hoa. */
function topicName(id: string, locale: "en" | "vi"): string | null {
  const l = LABELS[id as LabelId];
  return l ? l[locale].replace(/\s*\(.*\)\s*$/, "").toLocaleUpperCase() : null;
}

export function ProfileView({ id }: { id: string }) {
  const t = useTranslations("profile");
  const { owner } = useSession();
  const viewer = owner?.toLowerCase();
  const [list, setList] = useState<"followers" | "following" | null>(null);
  const [tab, setTab] = useState<Tab>("posts");

  const q = useQuery({
    queryKey: ["user", id, viewer],
    queryFn: () => api<User>(`/users/${encodeURIComponent(id)}${qs({ viewer })}`),
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 1,
  });

  if (q.isPending) {
    return (
      <div className="space-y-4 px-6 pt-5">
        <div className="skeleton mx-auto aspect-[342/216] w-full max-w-[342px] rounded-[18px]" />
        <div className="skeleton h-12 w-full rounded-2xl" />
        <div className="skeleton h-12 w-full rounded-full" />
      </div>
    );
  }
  if (q.isError || !q.data) {
    // Địa chỉ chưa đăng ký vẫn có trang (có thể được follow trước).
    const isAddr = /^0x[0-9a-fA-F]{40}$/.test(id);
    return isAddr ? <Empty icon="user" text={t("notRegistered")} /> : <Empty icon="alert" text="404" />;
  }

  const u = q.data;
  return (
    <div>
      <Hero u={u} viewer={viewer} onList={setList} />

      <div className="px-4 pb-2">
        <Segmented<Tab>
          iconOnly
          value={tab}
          onChange={setTab}
          testId="profile-tabs"
          items={[
            { key: "posts", icon: "reply", label: t("tabPosts") },
            { key: "replies", icon: "chat", label: t("tabReplies") },
            { key: "feeds", icon: "layers", label: t("tabFeeds") },
          ]}
        />
      </div>

      <div
        key={tab}
        role="tabpanel"
        aria-label={tab === "posts" ? t("tabPosts") : tab === "replies" ? t("tabReplies") : t("tabFeeds")}
        className="anim-drop border-t border-[var(--line)]"
      >
        {tab === "feeds" ? (
          <ProfileFeeds address={u.address} />
        ) : (
          <FeedList
            queryKey={["user-posts", u.address, viewer, tab]}
            emptyText={tab === "replies" ? t("noReplies") : t("noPosts")}
            fetchPage={async (cursor) => {
              const r = await api<{ items: Post[]; nextCursor: number | null }>(
                `/users/${u.address}/posts${qs({ cursor, limit: 20, viewer, kind: tab })}`,
              );
              return { rows: r.items.map((post) => ({ post })), nextCursor: r.nextCursor };
            }}
          />
        )}
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

function Hero({
  u,
  viewer,
  onList,
}: {
  u: User;
  viewer: string | undefined;
  onList: (l: "followers" | "following") => void;
}) {
  const t = useTranslations("profile");
  const tc = useTranslations("idcard");
  const locale = useLocale() as "en" | "vi";
  const isMe = viewer === u.address;
  const initial = u.viewer?.following ?? false;
  const f = useFollow(u.address, initial);
  const feeds = useAuthorFeeds(u.address);
  const n = u.builder?.contractsDeployed ?? 0;
  const followers = u.counts.followers + (f.following ? 1 : 0) - (initial ? 1 : 0);
  const explorer = addressUrl(u.address);
  const focus = (u.topTopics ?? [])
    .map((x) => topicName(x, locale))
    .filter((x): x is string => Boolean(x))
    .slice(0, 2)
    .join(" · ");
  const name = u.profile.displayName || (u.handle ? `@${u.handle}` : shortAddr(u.address));
  const path = `/u/${u.handle ?? u.address}`;
  const verifiedLabel = explorer ? t("verifiedAria", { n }) : t("verifiedAriaLocal", { n });

  return (
    <section className="px-6 pt-4 pb-4">
      {isMe && (
        <div className="-mx-2 mb-2 flex items-center">
          <span className="mono flex h-[30px] items-center gap-1.5 rounded-full bg-[var(--soft)] px-3 text-[12px] font-semibold">
            <span className="h-[7px] w-[7px] rounded-full bg-[var(--accent)]" />
            {NET}
          </span>
          <span className="flex-1" />
          {FC_ENABLED && (
            <Link
              href="/import"
              aria-label={t("importF")}
              title={t("importF")}
              className="press flex h-11 w-11 items-center justify-center rounded-full"
              data-testid="profile-import"
            >
              <Icon name="download" className="h-[22px] w-[22px]" strokeWidth={2} />
            </Link>
          )}
        </div>
      )}

      <div className={`${motion.rise} mx-auto w-full max-w-[342px]`}>
        <IdCard
          variant={n > 0 ? "builder" : "reader"}
          handle={u.handle}
          address={u.address}
          minted={u.registered}
          block={u.registeredBlock}
          verified={n > 0 ? "" : null}
          stampDelay={350}
          shine="once"
          fields={[
            { k: tc("chain"), v: NET.toUpperCase() },
            { k: tc("focus"), v: focus || "—" },
            { k: tc("feed"), v: feeds.data ? String(feeds.data.length) : "—" },
          ]}
        />
      </div>

      {(u.profile.displayName || u.profile.bio) && (
        <div className="mt-4">
          {u.profile.displayName && (
            <h1 className="text-[20px] font-extrabold leading-tight tracking-[-0.02em]">
              {u.profile.displayName}
            </h1>
          )}
          {u.profile.bio && <PostText text={u.profile.bio} className="mt-1 text-[15px]" />}
        </div>
      )}
      {!u.profile.displayName && <h1 className="sr-only">{name}</h1>}

      <div className="mt-4 grid grid-cols-3 gap-2">
        {n > 0 ? (
          explorer ? (
            <a
              href={explorer}
              target="_blank"
              rel="noreferrer"
              aria-label={verifiedLabel}
              title={verifiedLabel}
              className="press flex min-h-[52px] flex-col justify-center gap-0.5"
              data-testid="builder-badge"
            >
              <VerifiedStat n={n} link />
            </a>
          ) : (
            <span
              role="img"
              aria-label={verifiedLabel}
              title={verifiedLabel}
              className="flex min-h-[52px] flex-col justify-center gap-0.5"
              data-testid="builder-badge"
            >
              <VerifiedStat n={n} />
            </span>
          )
        ) : (
          <span className="flex min-h-[52px] flex-col justify-center gap-0.5">
            <RollUp
              value={u.counts.posts}
              className="text-[24px] font-extrabold leading-7 tracking-[-0.03em]"
            />
            <span className="text-[12px] text-[var(--muted)]">{t("postsCount")}</span>
          </span>
        )}
        <button
          type="button"
          onClick={() => onList("followers")}
          className="press flex min-h-[52px] flex-col items-start justify-center gap-0.5 text-left"
          data-testid="followers-count"
        >
          <RollUp value={followers} className="text-[24px] font-extrabold leading-7 tracking-[-0.03em]" />
          <span className="text-[12px] text-[var(--muted)]">{t("statFollowers")}</span>
        </button>
        <button
          type="button"
          onClick={() => onList("following")}
          className="press flex min-h-[52px] flex-col items-start justify-center gap-0.5 text-left"
        >
          <RollUp
            value={u.counts.following}
            className="text-[24px] font-extrabold leading-7 tracking-[-0.03em]"
          />
          <span className="text-[12px] text-[var(--muted)]">{t("statFollowing")}</span>
        </button>
      </div>

      <div className="mt-3 flex gap-2">
        {isMe ? (
          <>
            <Link
              href="/settings#profile"
              className="press flex h-12 flex-1 items-center justify-center rounded-full border-[1.5px] border-[var(--line)] text-[15px] font-bold"
            >
              {t("edit")}
            </Link>
            <ShareButton title={name} path={path} wide />
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void f.toggle()}
              aria-pressed={f.following}
              className={`press flex h-12 flex-1 items-center justify-center gap-2 rounded-full border-[1.5px] text-[16px] font-bold transition-colors ${
                f.following
                  ? "border-[var(--line)] bg-[var(--bg)] text-[var(--ink)]"
                  : "border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)]"
              }`}
              data-testid="follow"
            >
              {f.following ? (
                <span key="on" className={f.changed ? "anim-pop flex" : "flex"}>
                  <Icon name="check" className="h-[18px] w-[18px] text-[var(--accent)]" strokeWidth={2.8} />
                </span>
              ) : (
                <Icon name="plus" className="h-[18px] w-[18px]" strokeWidth={2.6} />
              )}
              {f.following ? t("following") : u.viewer?.followedBy ? t("followBack") : t("follow")}
            </button>
            {/* DM: <MessageButton address={u.address} /> */}
            <ShareButton title={name} path={path} />
          </>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1 text-[13px]">
        {u.farcaster && (
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--soft)] px-3">
            <Icon name="arch" className="h-4 w-4 text-[#8a63d2]" />@{u.farcaster.username}
          </span>
        )}
        {u.viewer?.followedBy && !isMe && (
          <span className="inline-flex h-8 items-center rounded-full bg-[var(--soft)] px-3 text-[var(--muted)]">
            {t("followsYou")}
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => void navigator.clipboard?.writeText(u.address).catch(() => undefined)}
          aria-label={t("copyAddr")}
          title={u.address}
          className="press flex h-11 w-11 items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--ink)]"
        >
          <Icon name="copy" className="h-[18px] w-[18px]" />
        </button>
        {explorer && (
          <a
            href={explorer}
            target="_blank"
            rel="noreferrer"
            aria-label={t("explorer")}
            title={t("explorer")}
            className="press flex h-11 w-11 items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--ink)]"
          >
            <Icon name="external" className="h-[18px] w-[18px]" />
          </a>
        )}
        <a
          href={`${API_URL}/users/${u.address}`}
          target="_blank"
          rel="noreferrer"
          aria-label="API"
          title="API"
          className="press flex h-11 w-11 items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--ink)]"
        >
          <Icon name="code" className="h-[18px] w-[18px]" />
        </a>
      </div>
    </section>
  );
}

function VerifiedStat({ n, link = false }: { n: number; link?: boolean }) {
  const t = useTranslations("profile");
  return (
    <>
      <span className="flex items-center gap-1.5">
        <span className="anim-pop flex" style={{ animationDelay: "700ms" }}>
          <Seal />
        </span>
        <RollUp value={n} className="text-[24px] font-extrabold leading-7 tracking-[-0.03em]" />
      </span>
      <span className="text-[12px] font-semibold text-[var(--red-ink)]">
        {t("contract", { n })}
        {link ? " ↗" : ""}
      </span>
    </>
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
