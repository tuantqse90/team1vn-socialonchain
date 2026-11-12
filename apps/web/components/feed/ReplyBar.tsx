"use client";

import { byteLength, channelHash, MAX_POST_BYTES, postsAbi, ZERO_BYTES32 } from "@socialonchain/protocol";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type RefObject, useEffect, useRef, useState } from "react";
import { track } from "@/lib/api";
import { contracts } from "@/lib/chain";
import { gasLevel, useSession } from "@/lib/session";
import { useSessionWriteTx } from "@/lib/tx";
import type { Post } from "@/lib/types";
import { Avatar } from "../bits";
import { Icon } from "../Icon";
import { useTopUp } from "../TopUpSheet";
import { meAuthor, rawId, shortHandle } from "./util";

const RING = 69.12; // 2π × 11

/**
 * Thanh trả lời dính đáy trang thread: ô nhập dạng pill, vòng byte 28px (≥ 90% thì đỏ + phóng 1.14, hiện số byte
 * còn lại; vượt 1024 thì rung), nút gửi tròn 36px. Đăng bằng session key (không popup ví).
 */
export function ReplyBar({
  root,
  target,
  inputRef,
  onSent,
}: {
  root: Post;
  /** Bài được trả lời (root hoặc 1 reply). */
  target: Post;
  inputRef: RefObject<HTMLInputElement | null>;
  onSent?: () => void;
}) {
  const t = useTranslations("thread");
  const tc = useTranslations("card");
  const { status, owner, me, sessionBalance } = useSession();
  const writeTx = useSessionWriteTx();
  const topUp = useTopUp();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const bytes = byteLength(text);
  const pct = bytes / MAX_POST_BYTES;
  const near = pct >= 0.9;
  const over = bytes > MAX_POST_BYTES;
  const can = text.trim().length > 0 && !over && !busy;
  const wasOver = useRef(false);
  useEffect(() => {
    if (over && !wasOver.current) setShake((s) => s + 1);
    wasOver.current = over;
  }, [over]);

  const bar =
    "sticky bottom-0 z-20 border-t border-[var(--line)] bg-[var(--bg)] px-3 pt-2 pb-[max(8px,env(safe-area-inset-bottom))]";
  const placeholder = t("replyTo", { handle: shortHandle(target.author) });

  if (status !== "ready") {
    return (
      <div className={bar}>
        <Link
          href="/welcome"
          className="press flex h-12 items-center gap-2.5 rounded-full bg-[var(--soft)] pr-2 pl-4 text-[15px] text-[var(--muted)]"
        >
          <span className="min-w-0 flex-1 truncate">{placeholder}</span>
          <span className="flex h-9 items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 text-[13px] font-semibold text-[var(--accent-ink)]">
            <Icon name="key" className="h-4 w-4" />
            {t("join")}
          </span>
        </Link>
      </div>
    );
  }

  async function send() {
    if (over) {
      setShake((s) => s + 1);
      return;
    }
    if (!can || !contracts || !owner) return;
    if (gasLevel(sessionBalance) === "empty") {
      topUp.open("empty");
      return;
    }
    setBusy(true);
    const r = await writeTx(tc("reply"), {
      address: contracts.Posts,
      abi: postsAbi,
      functionName: "post",
      args: [
        owner,
        text.trim(),
        rawId(target.id),
        root.channel ? channelHash(root.channel) : ZERO_BYTES32,
        "0x",
      ],
    });
    setBusy(false);
    if (r.ok) {
      track("reply", { channel: Boolean(root.channel) });
      setText("");
      onSent?.();
    }
  }

  return (
    <div className={`${bar} flex items-center gap-2.5`}>
      <Avatar author={meAuthor(owner, me)} size={32} />
      <div className="flex h-12 min-w-0 flex-1 items-center gap-1.5 rounded-full bg-[var(--soft)] pr-0.5 pl-4">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          autoComplete="off"
          enterKeyHint="send"
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-[var(--muted)]"
          data-testid="reply-input"
        />
        <span key={shake} className={`inline-flex shrink-0 ${shake ? "anim-shake" : ""}`}>
          <span
            role="img"
            aria-label={t("bytes", { n: bytes })}
            className="relative flex h-7 w-7 items-center justify-center"
            style={{ transform: near ? "scale(1.14)" : "none", transition: "transform .45s var(--bouncy)" }}
          >
            <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden className="absolute inset-0">
              <circle cx="14" cy="14" r="11" fill="none" strokeWidth="3" style={{ stroke: "var(--line)" }} />
              <circle
                cx="14"
                cy="14"
                r="11"
                fill="none"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={RING}
                strokeDashoffset={(RING * (1 - Math.min(1, pct))).toFixed(2)}
                transform="rotate(-90 14 14)"
                style={{
                  stroke: near ? "var(--accent)" : "var(--ink)",
                  transition: "stroke-dashoffset .2s, stroke .3s",
                }}
              />
            </svg>
            {near && (
              <span
                className={`mono relative text-[9px] font-semibold ${over ? "text-[var(--red-ink)]" : "text-[var(--ink)]"}`}
              >
                {MAX_POST_BYTES - bytes}
              </span>
            )}
          </span>
        </span>
        <button
          type="button"
          onClick={() => void send()}
          disabled={!can && !over}
          aria-label={t("send")}
          title={t("send")}
          data-testid="reply-send"
          className="press flex h-11 w-11 shrink-0 items-center justify-center"
        >
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-200 ${
              can || busy ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "text-[var(--muted)]"
            }`}
          >
            {busy ? (
              <span className="spinner" aria-hidden />
            ) : (
              <Icon name="up" className="h-[18px] w-[18px]" strokeWidth={2.6} />
            )}
          </span>
        </button>
      </div>
    </div>
  );
}
