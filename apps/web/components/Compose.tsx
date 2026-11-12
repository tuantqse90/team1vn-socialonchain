"use client";

import { byteLength, channelHash, MAX_POST_BYTES, postsAbi, ZERO_BYTES32 } from "@socialonchain/protocol";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  createContext,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { api, track as trackEvent } from "@/lib/api";
import { contracts } from "@/lib/chain";
import { shortAddr } from "@/lib/format";
import { gasLevel, useSession } from "@/lib/session";
import { useSessionWriteTx } from "@/lib/tx";
import type { Post, User } from "@/lib/types";
import { Avatar, Sheet } from "./bits";
import { MentionList, type MentionUser, mentionAt, useMentionResults } from "./compose/mentions";
import { type Posted, PostedPanel } from "./compose/PostedPanel";
import { ByteRing, ChannelChips, ChannelPill, GasChip, NoPopupIcon } from "./compose/parts";
import { Icon, type IconName } from "./Icon";
import { useTopUp } from "./TopUpSheet";

type Target = { parent?: Post | null; channel?: string | null };
type Ctx = { open: (t?: Target) => void };
const ComposeCtx = createContext<Ctx | null>(null);

/** Sheet tự đóng sau khi hiện trạng thái "đã đăng" chừng này ms. */
const POSTED_MS = 1600;

export function useCompose(): Ctx {
  const c = useContext(ComposeCtx);
  if (!c) throw new Error("useCompose outside ComposeProvider");
  return c;
}

/** Composer toàn cục dạng sheet (mở từ nút + hoặc nút reply). */
export function ComposeProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Target | null>(null);
  const open = useCallback((t: Target = {}) => setTarget(t), []);
  const close = useCallback(() => setTarget(null), []);
  const tb = useTranslations("tabbar");
  return (
    <ComposeCtx.Provider value={{ open }}>
      {children}
      <Sheet open={target !== null} onClose={close} label={tb("compose")}>
        {target && (
          <Composer
            parent={target.parent ?? null}
            channel={target.channel ?? null}
            autoFocus
            onDone={close}
            onClose={close}
          />
        )}
      </Sheet>
    </ComposeCtx.Provider>
  );
}

function rawId(id: string): `0x${string}` {
  return id.slice(3) as `0x${string}`;
}

function ToolButton({
  icon,
  label,
  onClick,
  pressed,
  children,
  testId,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children?: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      // Giữ focus + vị trí con trỏ trong textarea khi bấm.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      data-testid={testId}
      className={`press flex h-11 min-w-11 items-center justify-center gap-1 rounded-full px-2.5 transition-colors hover:text-[var(--ink)] ${
        pressed || children ? "text-[var(--ink)]" : ""
      }`}
    >
      <Icon name={icon} className="h-[22px] w-[22px]" strokeWidth={1.9} />
      {children}
    </button>
  );
}

/**
 * Ô đăng bài. Ký bằng session key (không popup ví). Dạng sheet (có `onClose`) hoặc inline (`compact`).
 * Hết gas thì nút Đăng bị khoá và mở sheet nạp gas; sắp hết gas chỉ nhắc ở chip gas, không chặn.
 */
export function Composer({
  parent = null,
  channel: initialChannel = null,
  autoFocus = false,
  compact = false,
  onDone,
  onClose,
  placeholder,
}: {
  parent?: Post | null;
  /** Kênh cố định (trang kênh): hiện dạng pill, không đổi được. */
  channel?: string | null;
  autoFocus?: boolean;
  compact?: boolean;
  onDone?: () => void;
  /** Có thì hiện nút đóng ở header (composer trong sheet). */
  onClose?: () => void;
  placeholder?: string;
}) {
  const t = useTranslations("composer");
  const tc = useTranslations("common");
  const { status, owner, me, sessionBalance } = useSession();
  const write = useSessionWriteTx();
  const topUp = useTopUp();
  const [text, setText] = useState("");
  const [channel, setChannel] = useState<string | null>(initialChannel);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [posted, setPosted] = useState<Posted | null>(null);
  const [flash, setFlash] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const nextCaret = useRef<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const mounted = useRef(true);
  const listId = useId();
  const locked = initialChannel !== null;
  const viewer = owner?.toLowerCase();

  const self = useQuery({
    queryKey: ["user", viewer, "self"],
    queryFn: () => api<User>(`/users/${viewer}`),
    enabled: Boolean(viewer) && !compact,
    staleTime: 60_000,
  });

  const token = mentionAt(text, caret);
  const tokenOpen = token && token.start !== dismissed ? token : null;
  const users = useMentionResults(tokenOpen?.prefix ?? null, viewer);
  const listOpen = Boolean(tokenOpen) && users.length > 0 && !posted;
  const activeIdx = Math.max(0, Math.min(active, users.length - 1));

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const all = timers.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      all.forEach(clearTimeout);
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: về đầu danh sách mỗi khi prefix đổi
  useEffect(() => setActive(0), [tokenOpen?.prefix]);
  // Hết token @ thì bỏ trạng thái "đã đóng bằng Esc".
  const hasToken = token !== null;
  useEffect(() => {
    if (!hasToken) setDismissed(null);
  }, [hasToken]);

  // textarea tự giãn; đặt lại con trỏ sau khi chèn @/mention.
  // biome-ignore lint/correctness/useExhaustiveDependencies: chạy lại mỗi khi text đổi
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, compact ? 240 : 360)}px`;
    const n = nextCaret.current;
    if (n !== null) {
      nextCaret.current = null;
      el.focus();
      el.setSelectionRange(n, n);
      setCaret(n);
    }
  }, [text]);

  if (status !== "ready") {
    return (
      <div className="flex items-center justify-between gap-3 py-2">
        <span className="text-sm text-[var(--muted)]">{t("needsJoin")}</span>
        <Link
          href="/welcome"
          aria-label={t("needsJoin")}
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
  const empty = gasLevel(sessionBalance) === "empty";
  const canPost = !busy && text.trim().length > 0 && !over && parentOk;
  // Sheet đã đóng trong lúc chờ tx thì không hẹn giờ nữa (tránh đóng nhầm sheet mở sau).
  const later = (ms: number, fn: () => void) => {
    if (mounted.current) timers.current.push(setTimeout(fn, ms));
  };

  async function submit() {
    if (empty) {
      topUp.open("empty");
      return;
    }
    if (!contracts || !owner || !canPost) return;
    const body = text.trim();
    setBusy(true);
    setPicker(false);
    const r = await write(parent ? t("replyShort") : t("post"), {
      address: contracts.Posts,
      abi: postsAbi,
      functionName: "post",
      args: [
        owner,
        body,
        parent ? rawId(parent.id) : ZERO_BYTES32,
        channel ? channelHash(channel) : ZERO_BYTES32,
        "0x",
      ],
    });
    setBusy(false);
    if (!r.ok) return;
    trackEvent(parent ? "reply" : "post", { channel: Boolean(channel) });
    setText("");
    setCaret(0);
    if (compact) {
      setFlash(true);
      later(1200, () => setFlash(false));
      onDone?.();
    } else {
      setPosted({
        text: body,
        channel: parent ? null : channel,
        block: r.blockNumber,
        hash: r.hash,
        fee: r.fee,
      });
      later(POSTED_MS, () => onDone?.());
    }
  }

  function pick(u: MentionUser) {
    if (!tokenOpen) return;
    const insert = `@${u.handle} `;
    nextCaret.current = tokenOpen.start + insert.length;
    setText(text.slice(0, tokenOpen.start) + insert + text.slice(tokenOpen.end));
  }

  function insertAt() {
    const el = ref.current;
    const pos = el ? el.selectionStart : text.length;
    const before = text.slice(0, pos);
    const sep = before && !/\s$/.test(before) ? " " : "";
    nextCaret.current = pos + sep.length + 1;
    setText(`${before}${sep}@${text.slice(pos)}`);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing) return;
    if (listOpen && tokenOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const d = e.key === "ArrowDown" ? 1 : -1;
        setActive((activeIdx + d + users.length) % users.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        const u = users[activeIdx];
        if (u) {
          e.preventDefault();
          pick(u);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDismissed(tokenOpen.start);
        return;
      }
    }
    if (e.key === "Escape" && picker) {
      e.preventDefault();
      setPicker(false);
      return;
    }
    if (e.key === "Escape" && onClose) {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  }

  const meAuthor = {
    address: viewer ?? null,
    handle: self.data?.handle ?? null,
    displayName: me?.profile?.displayName ?? null,
    avatarUrl: me?.profile?.avatarUrl ?? null,
    fid: null,
    fcUsername: null,
    contractsDeployed: self.data?.builder?.contractsDeployed ?? 0,
  };
  const selfName = self.data?.handle ?? me?.profile?.displayName ?? shortAddr(owner);

  const postAria = empty ? t("locked") : parent ? t("replyAria") : t("postAria");
  const postButton = (
    <button
      type="button"
      onClick={() => void submit()}
      disabled={!empty && !canPost}
      aria-label={postAria}
      title={postAria}
      data-testid="composer-submit"
      className={`press inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-bold transition-colors ${
        compact ? "h-10 min-w-11 px-4 text-sm" : "h-[52px] min-w-[116px] px-6 text-[17px]"
      } ${
        busy
          ? "bg-[var(--graphite)] text-[var(--bg)]"
          : empty
            ? "bg-[var(--blush)] text-[var(--red-ink)]"
            : canPost || flash
              ? "bg-[var(--ink)] text-[var(--bg)]"
              : "bg-[var(--line)] text-[var(--muted)]"
      }`}
    >
      {busy ? (
        <span className="spinner" aria-hidden />
      ) : empty ? (
        <Icon name="lock" className="h-[18px] w-[18px]" strokeWidth={2.2} />
      ) : flash ? (
        <span className="anim-pop inline-flex">
          <Icon name="check" className="h-[18px] w-[18px]" strokeWidth={2.6} />
        </span>
      ) : compact ? (
        <Icon name="send" className="h-4 w-4" />
      ) : null}
      {!busy && <span className={compact ? "sr-only" : ""}>{parent ? t("replyShort") : t("post")}</span>}
    </button>
  );

  const textarea = (
    <textarea
      ref={ref}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        setCaret(e.target.selectionStart);
      }}
      onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
      onKeyDown={onKeyDown}
      placeholder={placeholder ?? (parent ? t("reply") : t("placeholder"))}
      aria-label={t("textLabel")}
      aria-autocomplete="list"
      aria-controls={listOpen ? listId : undefined}
      aria-activedescendant={listOpen ? `${listId}-${activeIdx}` : undefined}
      rows={compact ? 1 : 3}
      className={`w-full resize-none bg-transparent placeholder:text-[var(--muted)] ${
        compact ? "text-[15px] leading-6" : "min-h-[136px] text-[19px] leading-[1.45] tracking-[-0.01em]"
      }`}
      data-testid="composer-input"
    />
  );

  const mentionList = listOpen && (
    <MentionList id={listId} users={users} active={activeIdx} onPick={pick} onHover={setActive} />
  );
  const chips = picker && !parent && !locked && (
    <ChannelChips
      value={channel}
      onPick={(c) => {
        setChannel(c);
        setPicker(false);
        ref.current?.focus();
      }}
    />
  );
  const quote = parent && (
    <div className="line-clamp-2 border-l-2 border-[var(--line)] pl-3 text-sm text-[var(--muted)]">
      {parent.text}
    </div>
  );
  const mentionButton = <ToolButton icon="at" label={t("mention")} onClick={insertAt} />;

  if (compact) {
    return (
      <div className="min-w-0" data-testid="composer">
        {quote && <div className="mb-2">{quote}</div>}
        {textarea}
        {chips && <div className="mt-2">{chips}</div>}
        {mentionList && <div className="mt-2">{mentionList}</div>}
        <div className="-ml-2.5 mt-1 flex items-center gap-1 text-[var(--muted)]">
          {mentionButton}
          {!parent &&
            (locked ? (
              <ChannelPill value={channel} open={false} locked onToggle={() => undefined} />
            ) : (
              <ToolButton
                icon="hash"
                label={t("channelAria", { name: channel ? `/${channel}` : t("noChannel") })}
                onClick={() => setPicker((v) => !v)}
                pressed={picker}
                testId="composer-channel"
              >
                {channel && <span className="mono text-[12.5px] font-semibold">/{channel}</span>}
              </ToolButton>
            ))}
          {gasLevel(sessionBalance) !== "ok" && <GasChip small />}
          <span className="flex-1" />
          <ByteRing bytes={bytes} size={32} />
          <span
            role="img"
            aria-label={`${t("autoSign")} · ${t("noPopup")}`}
            title={`${t("autoSign")} · ${t("noPopup")}`}
            className="flex h-10 w-7 items-center justify-center"
          >
            <Icon name="key" className="h-4 w-4" strokeWidth={2.2} />
          </span>
          {postButton}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="composer">
      <div className="-mx-2 -mt-3 flex items-center justify-between">
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label={tc("close")}
            title={tc("close")}
            className="press flex h-11 w-11 items-center justify-center"
          >
            <Icon name="x" className="h-[22px] w-[22px]" strokeWidth={2} />
          </button>
        ) : (
          <span />
        )}
        <h2 className="sr-only">{parent ? t("replyShort") : t("title")}</h2>
        <GasChip />
      </div>

      {posted ? (
        <PostedPanel posted={posted} author={meAuthor} name={selfName} />
      ) : (
        <>
          {quote}
          <div className="flex items-center gap-3">
            <Avatar author={meAuthor} size={44} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[15px] font-bold leading-5">{selfName}</span>
              {!parent && (
                <ChannelPill
                  value={channel}
                  open={picker}
                  locked={locked}
                  onToggle={() => setPicker((v) => !v)}
                />
              )}
            </div>
          </div>
          {chips}
          {textarea}
          {mentionList}
          <div className="-ml-2.5 flex items-center text-[var(--muted)]">
            {mentionButton}
            {!parent && !locked && (
              <ToolButton
                icon="hash"
                label={t("channel")}
                onClick={() => setPicker((v) => !v)}
                pressed={picker}
              />
            )}
            <span className="ml-auto">
              <ByteRing bytes={bytes} />
            </span>
          </div>
          <div className="flex items-center gap-2.5 pt-1">
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--muted)]">
              <Icon name="key" className="h-[17px] w-[17px]" strokeWidth={2.2} />
              {t("autoSign")}
            </span>
            <span
              role="img"
              aria-label={t("noPopup")}
              title={t("noPopup")}
              className="flex h-8 w-8 items-center justify-center text-[var(--muted)]"
            >
              <NoPopupIcon className="h-[18px] w-[18px]" />
            </span>
            <span className="ml-auto">{postButton}</span>
          </div>
        </>
      )}
    </div>
  );
}
