"use client";

import { postsAbi } from "@socialonchain/protocol";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { contracts, txUrl } from "@/lib/chain";
import { useSession } from "@/lib/session";
import { useSessionWrite } from "@/lib/tx";
import type { Post } from "@/lib/types";
import { Avatar, Sheet } from "../bits";
import { Icon, type IconName } from "../Icon";
import { rawId, shortHandle } from "./util";

const REASONS: { id: "spam" | "shill" | "toxic" | "doxxing" | "nsfw" | "illegal"; icon: IconName }[] = [
  { id: "spam", icon: "mail" },
  { id: "shill", icon: "megaphone" },
  { id: "toxic", icon: "toxic" },
  { id: "doxxing", icon: "idcard" },
  { id: "nsfw", icon: "eyeoff" },
  { id: "illegal", icon: "shield" },
];
type ReportReason = (typeof REASONS)[number]["id"];

/** Menu của bài (chép link, xem tx, ẩn tác giả, báo cáo, xoá) và sheet báo cáo dạng lưới icon. */
export function PostMenu({
  post,
  onClose,
  onReported,
}: {
  post: Post;
  onClose: () => void;
  /** Gọi sau khi báo cáo thành công (để thu gọn bài phía client). */
  onReported?: () => void;
}) {
  const t = useTranslations("card");
  const { status, owner, me } = useSession();
  const write = useSessionWrite();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"menu" | "report">("menu");
  const [copied, setCopied] = useState(false);
  const mine = owner && post.author.address === owner.toLowerCase();
  const authorKey = post.author.address ?? (post.author.fid ? `fid:${post.author.fid}` : null);
  const tx = post.source === "onchain" && post.txHash ? txUrl(post.txHash) : null;

  async function del() {
    if (!contracts || !owner) return;
    onClose();
    await write(t("delete"), {
      address: contracts.Posts,
      abi: postsAbi,
      functionName: "deletePost",
      args: [owner, rawId(post.id)],
    }).catch(() => false);
  }

  async function mute() {
    if (!authorKey || !me) return;
    const muted = new Set(me.settings?.mutedAuthors ?? []);
    muted.add(authorKey);
    await api("/me/settings", { method: "PUT", json: { mutedAuthors: [...muted] } });
    await qc.invalidateQueries();
    onClose();
  }

  if (mode === "report") return <ReportSheet post={post} onClose={onClose} onReported={onReported} />;

  return (
    <Sheet open onClose={onClose} label={t("more")}>
      <div className="grid gap-1">
        <MenuRow
          icon={copied ? "check" : "copy"}
          label={copied ? t("copied") : t("copyLink")}
          onClick={() => {
            void navigator.clipboard?.writeText(`${location.origin}/p/${post.id}`);
            setCopied(true);
          }}
        />
        {tx && (
          <a
            href={tx}
            target="_blank"
            rel="noreferrer"
            className="press flex items-center gap-3 rounded-2xl px-3 py-3 text-[15px] hover:bg-[var(--soft)]"
          >
            <Icon name="cube" className="h-5 w-5" />
            <span className="flex-1">{t("explorer")}</span>
            <Icon name="external" className="h-4 w-4 text-[var(--muted)]" />
          </a>
        )}
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
    </Sheet>
  );
}

function ReportSheet({
  post,
  onClose,
  onReported,
}: {
  post: Post;
  onClose: () => void;
  onReported?: () => void;
}) {
  const t = useTranslations("reportSheet");
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [fail, setFail] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  async function submit() {
    if (!reason || busy || sent) return;
    setBusy(true);
    try {
      await api("/reports", { method: "POST", json: { postId: post.id, reason } });
      setSent(true);
      timer.current = setTimeout(() => {
        onReported?.();
        onClose();
      }, 1200);
    } catch {
      setFail((f) => f + 1);
    } finally {
      setBusy(false);
    }
  }

  const ready = reason !== null && !busy;
  return (
    <Sheet open onClose={() => (sent ? undefined : onClose())} label={t("title")}>
      <div className="flex flex-col gap-4" data-testid="report-sheet">
        <div className="flex items-center gap-2">
          <span className="text-[var(--accent)]">
            <Icon name="flag" className="h-[22px] w-[22px]" strokeWidth={2.2} />
          </span>
          <h2 className="text-[20px] font-extrabold tracking-tight">{t("title")}</h2>
          <span className="ml-auto flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-[var(--muted)]">
            <Avatar author={post.author} size={22} />
            <span className="truncate">{shortHandle(post.author)}</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            title={t("close")}
            className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--soft)]"
          >
            <Icon name="x" className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </button>
        </div>
        <div role="radiogroup" aria-label={t("title")} className="grid grid-cols-3 gap-2">
          {REASONS.map((r) => {
            const on = reason === r.id;
            return (
              // biome-ignore lint/a11y/useSemanticElements: ô icon 88px kiểu radio, input radio không tạo được layout này
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={sent}
                onClick={() => setReason(r.id)}
                data-testid={`report-${r.id}`}
                className={`press flex h-[88px] flex-col items-center justify-center gap-2 rounded-[20px] transition-colors duration-300 ${
                  on ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "bg-[var(--soft)] text-[var(--ink)]"
                }`}
              >
                <span
                  className="inline-flex"
                  style={{
                    transform: on ? "scale(1.15)" : "none",
                    transition: "transform .45s var(--bouncy)",
                  }}
                >
                  <Icon name={r.icon} className="h-[26px] w-[26px]" strokeWidth={1.9} />
                </span>
                <span className="whitespace-nowrap text-[13px] font-semibold">{t(r.id)}</span>
              </button>
            );
          })}
        </div>
        <span key={fail} className={fail ? "anim-shake" : ""}>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!ready && !sent}
            data-testid="report-submit"
            className={`press flex h-[54px] w-full items-center justify-center gap-2 rounded-[18px] text-[16px] font-bold transition-colors duration-300 ${
              ready || sent ? "bg-[var(--ink)] text-[var(--bg)]" : "bg-[var(--soft)] text-[var(--muted)]"
            }`}
          >
            {sent ? (
              <>
                <span className="anim-pop inline-flex">
                  <Icon name="check" className="h-5 w-5" strokeWidth={2.8} />
                </span>
                {t("sent")}
              </>
            ) : busy ? (
              <span className="spinner" aria-hidden />
            ) : (
              t("send")
            )}
          </button>
        </span>
      </div>
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
  icon: IconName;
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
      className={`press flex items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] hover:bg-[var(--soft)] ${danger ? "text-[var(--red-ink)]" : ""}`}
    >
      <Icon name={icon} className="h-5 w-5" />
      {label}
    </button>
  );
}
