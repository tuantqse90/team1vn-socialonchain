"use client";

import {
  byteLength,
  channelHash,
  KNOWN_CHANNELS,
  MAX_POST_BYTES,
  postsAbi,
  ZERO_BYTES32,
} from "@socialonchain/protocol";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { track as trackEvent } from "@/lib/api";
import { contracts } from "@/lib/chain";
import { LOW_GAS_WEI, useSession } from "@/lib/session";
import { useSessionWrite } from "@/lib/tx";
import type { Post } from "@/lib/types";
import { Avatar, Button, Chip, Ring, Sheet } from "./bits";
import { Icon } from "./Icon";

type Target = { parent?: Post | null; channel?: string | null };
type Ctx = { open: (t?: Target) => void };
const ComposeCtx = createContext<Ctx | null>(null);

export function useCompose(): Ctx {
  const c = useContext(ComposeCtx);
  if (!c) throw new Error("useCompose outside ComposeProvider");
  return c;
}

/** Composer toàn cục dạng sheet (mở từ nút + hoặc nút reply). */
export function ComposeProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Target | null>(null);
  const open = useCallback((t: Target = {}) => setTarget(t), []);
  return (
    <ComposeCtx.Provider value={{ open }}>
      {children}
      <Sheet open={target !== null} onClose={() => setTarget(null)}>
        {target && (
          <Composer
            parent={target.parent ?? null}
            channel={target.channel ?? null}
            autoFocus
            onDone={() => setTarget(null)}
          />
        )}
      </Sheet>
    </ComposeCtx.Provider>
  );
}

function rawId(id: string): `0x${string}` {
  return id.slice(3) as `0x${string}`;
}

export function Composer({
  parent = null,
  channel: initialChannel = null,
  autoFocus = false,
  compact = false,
  onDone,
}: {
  parent?: Post | null;
  channel?: string | null;
  autoFocus?: boolean;
  compact?: boolean;
  onDone?: () => void;
}) {
  const t = useTranslations("composer");
  const { status, owner, me, sessionBalance } = useSession();
  const write = useSessionWrite();
  const [text, setText] = useState("");
  const [channel, setChannel] = useState<string | null>(initialChannel);
  const [showChannels, setShowChannels] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  // textarea tự giãn
  // biome-ignore lint/correctness/useExhaustiveDependencies: chạy lại mỗi khi text đổi
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [text]);

  if (status !== "ready") {
    return (
      <div className="flex items-center justify-between gap-3 py-2">
        <span className="text-sm text-[var(--muted)]">{t("needsJoin")}</span>
        <Link
          href="/welcome"
          className="press rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)]"
        >
          <Icon name="userplus" className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  // Farcaster chỉ đọc: không trả lời được bài fc: onchain.
  const parentOk = !parent || parent.source === "onchain";
  const bytes = byteLength(text);
  const over = bytes > MAX_POST_BYTES;
  const lowGas = sessionBalance !== undefined && sessionBalance < LOW_GAS_WEI;

  async function submit() {
    if (!contracts || !owner || !text.trim() || over || !parentOk) return;
    setBusy(true);
    const ok = await write(parent ? t("reply") : t("post"), {
      address: contracts.Posts,
      abi: postsAbi,
      functionName: "post",
      args: [
        owner,
        text.trim(),
        parent ? rawId(parent.id) : ZERO_BYTES32,
        channel ? channelHash(channel) : ZERO_BYTES32,
        "0x",
      ],
    });
    setBusy(false);
    if (ok) {
      trackEvent(parent ? "reply" : "post", { channel: Boolean(channel) });
      setText("");
      onDone?.();
    }
  }

  const me4avatar = {
    address: owner ?? null,
    handle: null,
    displayName: me?.profile?.displayName ?? null,
    avatarUrl: me?.profile?.avatarUrl ?? null,
    fid: null,
    fcUsername: null,
    contractsDeployed: 0,
  };

  return (
    <div className="flex gap-3" data-testid="composer">
      {!compact && <Avatar author={me4avatar} size={36} />}
      <div className="min-w-0 flex-1">
        {parent && (
          <div className="mb-2 line-clamp-2 border-l-2 border-[var(--line)] pl-3 text-sm text-[var(--muted)]">
            {parent.text}
          </div>
        )}
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
          }}
          placeholder={parent ? t("reply") : t("placeholder")}
          rows={compact ? 1 : 2}
          className="w-full resize-none bg-transparent text-[15px] leading-6 placeholder:text-[var(--muted)]"
          data-testid="composer-input"
        />
        {showChannels && !parent && (
          <div className="no-scrollbar -mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 py-1">
            <Chip active={channel === null} onClick={() => setChannel(null)}>
              {t("noChannel")}
            </Chip>
            {KNOWN_CHANNELS.map((c) => (
              <Chip key={c} active={channel === c} onClick={() => setChannel(c)}>
                #{c}
              </Chip>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          {!parent && (
            <button
              type="button"
              onClick={() => setShowChannels((v) => !v)}
              className={`press inline-flex items-center gap-1 rounded-full px-2 py-1 text-[13px] ${channel ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}
              aria-label={t("channel")}
              title={t("channel")}
            >
              <Icon name="hash" className="h-[18px] w-[18px]" />
              {channel && <span>{channel}</span>}
            </button>
          )}
          {lowGas && (
            <Link
              href="/settings#session"
              className="inline-flex items-center gap-1 text-[12px] text-[var(--accent)]"
              title="Low gas"
            >
              <Icon name="fuel" className="h-4 w-4" />
            </Link>
          )}
          <div className="flex-1" />
          {text.length > 0 && (
            <span className="flex items-center gap-1.5">
              {bytes > MAX_POST_BYTES * 0.8 && (
                <span className={`mono text-[11px] ${over ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>
                  {MAX_POST_BYTES - bytes}
                </span>
              )}
              <Ring
                value={bytes / MAX_POST_BYTES}
                danger={bytes > MAX_POST_BYTES * 0.9}
                size={20}
                label={`${bytes}/${MAX_POST_BYTES} bytes`}
              />
            </span>
          )}
          <Button
            variant="solid"
            onClick={() => void submit()}
            disabled={busy || !text.trim() || over || !parentOk}
            testId="composer-submit"
            className="h-9 px-4"
          >
            {busy ? <span className="spinner" /> : <Icon name="send" className="h-4 w-4" />}
            <span className={compact ? "sr-only" : ""}>
              {parent ? t("reply").replace("…", "") : t("post")}
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}
