"use client";

import type { Reason } from "@socialonchain/feed-sdk";
import { LABELS } from "@socialonchain/feed-sdk";
import { postsAbi } from "@socialonchain/protocol";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { memo, useState } from "react";
import { api, track } from "@/lib/api";
import { contracts, txUrl } from "@/lib/chain";
import { displayName, handleOf, profileHref, timeAgo } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useSessionWrite } from "@/lib/tx";
import type { Post } from "@/lib/types";
import { Avatar, Button, Chip, IconButton, Sheet } from "./bits";
import { useCompose } from "./Compose";
import { Embeds } from "./Embeds";
import { Icon } from "./Icon";
import { PostText } from "./PostText";

const KIND_LIKE = 1;
const KIND_REPOST = 2;

function raw(id: string): `0x${string}` {
  return id.slice(3) as `0x${string}`;
}

export const PostCard = memo(function PostCard({
  post,
  reasons,
  big = false,
  showThreadLine = false,
}: {
  post: Post;
  reasons?: Reason[];
  big?: boolean;
  showThreadLine?: boolean;
}) {
  const t = useTranslations("post");
  const router = useRouter();
  const { status, owner } = useSession();
  const write = useSessionWrite();
  const compose = useCompose();
  const [why, setWhy] = useState(false);
  const [menu, setMenu] = useState(false);
  // Trạng thái lạc quan: bấm là đổi ngay, tx chạy nền.
  const [liked, setLiked] = useState<boolean | null>(null);
  const [reposted, setReposted] = useState<boolean | null>(null);

  const isLiked = liked ?? post.viewer?.liked ?? false;
  const isReposted = reposted ?? post.viewer?.reposted ?? false;
  const likeCount = post.stats.likes + (liked === null ? 0 : (liked ? 1 : 0) - (post.viewer?.liked ? 1 : 0));
  const repostCount =
    post.stats.reposts + (reposted === null ? 0 : (reposted ? 1 : 0) - (post.viewer?.reposted ? 1 : 0));
  const onchain = post.source === "onchain";
  const canAct = onchain && status === "ready" && !post.deleted;
  const href = profileHref(post.author);

  async function react(kind: number, on: boolean, set: (v: boolean) => void) {
    if (!canAct || !contracts || !owner) {
      if (status !== "ready") router.push("/welcome");
      return;
    }
    set(on);
    const ok = await write(kind === KIND_LIKE ? t("like") : t("repost"), {
      address: contracts.Posts,
      abi: postsAbi,
      functionName: on ? "react" : "unreact",
      args: [owner, raw(post.id), kind],
    });
    if (!ok) set(!on);
  }

  const openThread = () => router.push(`/p/${post.id}`);

  return (
    <article
      className={`relative flex gap-3 px-4 ${big ? "pt-4 pb-2" : "py-3"} ${big ? "" : "cursor-pointer hover:bg-[var(--soft)]/40"}`}
      data-testid="post"
      data-post-id={post.id}
      onClick={(e) => {
        if (big) return;
        if ((e.target as HTMLElement).closest("a,button,textarea,input")) return;
        openThread();
      }}
      onKeyDown={(e) => {
        if (!big && e.key === "Enter" && e.target === e.currentTarget) openThread();
      }}
    >
      <div className="flex flex-col items-center">
        {href ? (
          <Link href={href} aria-label={displayName(post.author)}>
            <Avatar author={post.author} size={big ? 44 : 38} />
          </Link>
        ) : (
          <Avatar author={post.author} size={big ? 44 : 38} />
        )}
        {showThreadLine && <div className="mt-1 w-[2px] flex-1 rounded bg-[var(--line)]" />}
      </div>
      <div className="min-w-0 flex-1">
        <header className="flex items-center gap-1.5 text-[14px]">
          {href ? (
            <Link href={href} className="truncate font-semibold hover:underline">
              {displayName(post.author)}
            </Link>
          ) : (
            <span className="truncate font-semibold">{displayName(post.author)}</span>
          )}
          <span className="truncate text-[var(--muted)]">{handleOf(post.author)}</span>
          <span className="text-[var(--muted)]">·</span>
          <time
            className="shrink-0 text-[var(--muted)]"
            dateTime={new Date(post.createdAt * 1000).toISOString()}
          >
            {timeAgo(post.createdAt)}
          </time>
          <span className="flex-1" />
          {onchain ? (
            post.txHash && txUrl(post.txHash) ? (
              <a
                href={txUrl(post.txHash) ?? "#"}
                target="_blank"
                rel="noreferrer"
                title={t("onchain")}
                className="text-[var(--muted)] hover:text-[var(--ink)]"
              >
                <Icon name="cube" className="h-4 w-4" />
              </a>
            ) : (
              <span title={t("onchain")} className="text-[var(--muted)]">
                <Icon name="cube" className="h-4 w-4" />
              </span>
            )
          ) : (
            <span title={t("farcaster")} className="text-[#8a63d2]">
              <Icon name="arch" className="h-4 w-4" />
            </span>
          )}
        </header>
        {post.channel && (
          <Link
            href={`/c/${post.channel}`}
            className="mt-0.5 inline-block text-[12px] font-medium text-[var(--muted)] hover:text-[var(--ink)]"
          >
            #{post.channel}
          </Link>
        )}
        {post.deleted ? (
          <div className="mt-1 flex items-center gap-1.5 text-sm italic text-[var(--muted)]">
            <Icon name="trash" className="h-4 w-4" /> {t("deleted")}
          </div>
        ) : (
          <>
            <PostText text={post.text} className={`mt-0.5 ${big ? "text-[17px] leading-[1.5]" : ""}`} />
            <Embeds urls={post.embeds} />
          </>
        )}
        <footer className="-ml-2 mt-1.5 flex items-center gap-1">
          <IconButton
            icon="heart"
            label={t("like")}
            active={isLiked}
            count={likeCount}
            onClick={() => void react(KIND_LIKE, !isLiked, setLiked)}
            disabled={!onchain}
            testId="like"
          />
          <IconButton
            icon="reply"
            label={t("reply")}
            count={post.stats.replies}
            onClick={() => (canAct ? compose.open({ parent: post }) : openThread())}
            testId="reply"
          />
          <IconButton
            icon="repost"
            label={t("repost")}
            active={isReposted}
            count={repostCount}
            filled={false}
            onClick={() => void react(KIND_REPOST, !isReposted, setReposted)}
            disabled={!onchain}
          />
          <span className="flex-1" />
          {reasons && (
            <IconButton
              icon="sparkle"
              label={t("why")}
              onClick={() => {
                setWhy(true);
                track("why_opened", { reasons: reasons.length });
              }}
              active={reasons.length > 0}
              filled={false}
              testId="why"
            />
          )}
          <IconButton icon="more" label={t("report")} onClick={() => setMenu(true)} testId="post-menu" />
        </footer>
      </div>
      {why && <WhySheet post={post} reasons={reasons ?? []} onClose={() => setWhy(false)} />}
      {menu && <PostMenu post={post} onClose={() => setMenu(false)} />}
    </article>
  );
});

export function WhySheet({ post, reasons, onClose }: { post: Post; reasons: Reason[]; onClose: () => void }) {
  const t = useTranslations("why");
  const locale = useLocale() as "en" | "vi";
  const labels = Object.entries(post.labels)
    .filter(([, s]) => s >= 0.5)
    .sort((a, b) => b[1] - a[1]);
  const groups: { key: "feed" | "moderation"; items: Reason[] }[] = [
    { key: "feed", items: reasons.filter((r) => r.origin === "feed") },
    { key: "moderation", items: reasons.filter((r) => r.origin === "moderation") },
  ];
  return (
    <Sheet open onClose={onClose} title={t("title")}>
      <div data-testid="why-sheet" className="space-y-5">
        {reasons.length === 0 && <p className="text-sm text-[var(--muted)]">{t("noReasons")}</p>}
        {groups
          .filter((g) => g.items.length > 0)
          .map((g) => (
            <section key={g.key}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                {t(g.key)}
              </h3>
              <ul className="space-y-2">
                {g.items.map((r) => (
                  <li
                    key={`${r.specName}-${r.ruleIndex}`}
                    className="flex items-center gap-3 rounded-2xl bg-[var(--soft)] px-3 py-2.5"
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        r.action === "boost"
                          ? "bg-[var(--ink)] text-[var(--bg)]"
                          : "bg-[var(--line)] text-[var(--ink)]"
                      }`}
                    >
                      <Icon
                        name={r.action === "boost" ? "up" : r.action === "hide" ? "eyeoff" : "down"}
                        className="h-4 w-4"
                      />
                    </span>
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block">{r.text[locale]}</span>
                      <span className="block text-xs text-[var(--muted)]">
                        {r.specName} · #{r.ruleIndex + 1}
                      </span>
                    </span>
                    <span className="mono text-xs text-[var(--muted)]">
                      {r.action === "boost" ? "+" : "−"}
                      {r.weight.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        {labels.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {t("labels")}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {labels.map(([l, s]) => (
                <span
                  key={l}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--soft)] px-3 py-1 text-xs"
                >
                  {LABELS[l as keyof typeof LABELS]?.[locale] ?? l}
                  <span className="mono text-[var(--muted)]">{s.toFixed(2)}</span>
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    </Sheet>
  );
}

const REPORT_REASONS = ["spam", "harassment", "doxxing", "nsfw", "illegal", "other"] as const;

function PostMenu({ post, onClose }: { post: Post; onClose: () => void }) {
  const t = useTranslations("post");
  const tr = useTranslations("report");
  const tc = useTranslations("common");
  const { status, owner, me } = useSession();
  const write = useSessionWrite();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"menu" | "report">("menu");
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number] | null>(null);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const mine = owner && post.author.address === owner.toLowerCase();
  const authorKey = post.author.address ?? (post.author.fid ? `fid:${post.author.fid}` : null);

  async function del() {
    if (!contracts || !owner) return;
    onClose();
    await write(t("delete"), {
      address: contracts.Posts,
      abi: postsAbi,
      functionName: "deletePost",
      args: [owner, raw(post.id)],
    });
  }

  async function mute() {
    if (!authorKey || !me) return;
    const muted = new Set(me.settings?.mutedAuthors ?? []);
    muted.add(authorKey);
    await api("/me/settings", { method: "PUT", json: { mutedAuthors: [...muted] } });
    await qc.invalidateQueries();
    onClose();
  }

  async function report() {
    if (!reason) return;
    await api("/reports", { method: "POST", json: { postId: post.id, reason } });
    setDone(true);
    setTimeout(onClose, 900);
  }

  return (
    <Sheet open onClose={onClose} title={mode === "report" ? tr("title") : undefined}>
      {mode === "menu" ? (
        <div className="grid gap-1">
          <MenuRow
            icon="copy"
            label={copied ? tc("copied") : tc("copy")}
            onClick={() => {
              void navigator.clipboard?.writeText(`${location.origin}/p/${post.id}`);
              setCopied(true);
            }}
          />
          {status === "ready" && !mine && authorKey && (
            <MenuRow icon="eyeoff" label={t("mute")} onClick={() => void mute()} />
          )}
          {status === "ready" && (
            <MenuRow icon="flag" label={t("report")} onClick={() => setMode("report")} testId="report" />
          )}
          {mine && post.source === "onchain" && !post.deleted && (
            <MenuRow icon="trash" label={t("delete")} onClick={() => void del()} danger />
          )}
        </div>
      ) : done ? (
        <div className="flex flex-col items-center gap-2 py-6 text-sm">
          <Icon name="check" className="h-8 w-8" />
          {tr("sent")}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {REPORT_REASONS.map((r) => (
              <Chip key={r} active={reason === r} onClick={() => setReason(r)} testId={`report-${r}`}>
                {tr(r)}
              </Chip>
            ))}
          </div>
          <Button
            variant="accent"
            disabled={!reason}
            onClick={() => void report()}
            className="w-full"
            testId="report-submit"
          >
            <Icon name="flag" className="h-4 w-4" />
            {t("report")}
          </Button>
        </div>
      )}
    </Sheet>
  );
}

function MenuRow({
  icon,
  label,
  onClick,
  danger,
  testId,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  onClick: () => void;
  danger?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`press flex items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] hover:bg-[var(--soft)] ${danger ? "text-[var(--accent)]" : ""}`}
    >
      <Icon name={icon} className="h-5 w-5" />
      {label}
    </button>
  );
}
