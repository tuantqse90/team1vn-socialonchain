"use client";

import { DM_MAX_TEXT, DM_QUICK_REACTIONS, type DmPayload } from "@socialonchain/protocol";
import { Icon } from "@socialonchain/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Avatar, Empty, Spinner } from "@/components/bits";
import styles from "@/components/dm/dm.module.css";
import { EmojiText } from "@/components/dm/EmojiText";
import { EnableDm } from "@/components/dm/EnableDm";
import { DmIcon } from "@/components/dm/icons";
import { ApiError, api } from "@/lib/api";
import { type DmMessage, type DmThread, sendDm, useDecrypted, useDmKeys, usePeerKeys } from "@/lib/dm";
import { EMOJI_PICKER, isEmojiOnly } from "@/lib/emoji";
import { displayName, handleOf, profileHref } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { User } from "@/lib/types";

const ADDR = /^0x[0-9a-fA-F]{40}$/;

export function ChatView({ id }: { id: string }) {
  const t = useTranslations("dm");
  const dm = useDmKeys();
  // id có thể là handle hoặc địa chỉ.
  const user = useQuery({
    queryKey: ["user", id],
    queryFn: () => api<User>(`/users/${encodeURIComponent(id)}`),
    retry: false,
  });
  const peer = (user.data?.address ?? (ADDR.test(id) ? id : undefined))?.toLowerCase();

  if (dm.status === "no-session")
    return (
      <BackBar>
        <Empty icon="lock" text={t("needsLogin")} />
      </BackBar>
    );
  if (dm.status === "loading" || (user.isPending && !ADDR.test(id)))
    return (
      <BackBar>
        <div className="skeleton m-4 h-16 rounded-2xl" />
      </BackBar>
    );
  if (dm.status === "off" || dm.status === "stale")
    return (
      <BackBar>
        <EnableDm dm={dm} />
      </BackBar>
    );
  if (!peer)
    return (
      <BackBar>
        <Empty icon="alert" text="404" />
      </BackBar>
    );
  return <Chat peer={peer} dm={dm} />;
}

/** Khung chat full-screen trên mobile (ẩn header + tab bar): các trạng thái chưa vào chat vẫn có đường quay lại. */
function BackBar({ children }: { children: ReactNode }) {
  const tc = useTranslations("common");
  return (
    <>
      <div className="glass sticky top-0 z-20 flex h-14 items-center px-2 md:hidden">
        <Link
          href="/messages"
          aria-label={tc("back")}
          className="press flex h-11 w-11 items-center justify-center text-[var(--ink)]"
        >
          <Icon name="left" className="h-6 w-6" />
        </Link>
      </div>
      {children}
    </>
  );
}

type Folded = {
  m: DmMessage;
  text: string | null;
  reason: string | null;
  reactions: { mine?: string; theirs?: string };
};

function Chat({ peer, dm }: { peer: string; dm: ReturnType<typeof useDmKeys> }) {
  const t = useTranslations("dm");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const { owner, token } = useSession();
  const me = owner?.toLowerCase() as string;
  const kp = dm.keys;
  const thread = useQuery({
    queryKey: ["dm", "thread", peer, token],
    queryFn: () => api<DmThread>(`/dm/threads/${peer}`),
    enabled: Boolean(token),
    refetchInterval: 4_000,
  });
  const peerKeys = usePeerKeys(peer);
  const keyMap = useMemo(
    () => new Map(peerKeys.data ? [[peer, peerKeys.data.verified]] : []),
    [peer, peerKeys.data],
  );
  const plain = useDecrypted(thread.data?.messages, me, kp, keyMap);

  const [text, setText] = useState("");
  const [tray, setTray] = useState(false);
  const [picker, setPicker] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  /** Chỉ tin đến sau lần tải đầu mới có hiệu ứng. */
  const firstMax = useRef<number | null>(null);

  const msgs = thread.data?.messages ?? [];
  if (thread.data && firstMax.current === null) firstMax.current = msgs[msgs.length - 1]?.id ?? 0;

  // Gộp reaction vào tin gốc; chỉ hiện tin text.
  const folded = useMemo(() => {
    const out: Folded[] = [];
    const byId = new Map<number, Folded>();
    for (const m of msgs) {
      const d = plain.data?.get(m.id);
      if (d?.ok && d.payload.t === "react") {
        const target = byId.get(d.payload.to);
        if (target) target.reactions[m.sender === me ? "mine" : "theirs"] = d.payload.emoji || undefined;
        continue;
      }
      const f: Folded = {
        m,
        text: d?.ok && d.payload.t === "text" ? d.payload.text : null,
        reason: d && !d.ok ? d.reason : d ? null : "loading",
        reactions: {},
      };
      byId.set(m.id, f);
      out.push(f);
    }
    return out;
  }, [msgs, plain.data, me]);

  const lastId = msgs[msgs.length - 1]?.id ?? 0;
  // Cuộn xuống + đánh dấu đã đọc khi có tin mới.
  useEffect(() => {
    if (!lastId) return;
    bottom.current?.scrollIntoView({
      block: "end",
      behavior: firstMax.current === lastId ? "auto" : "smooth",
    });
    void api(`/dm/threads/${peer}/read`, { method: "POST", json: { upTo: lastId } })
      .then(() => qc.invalidateQueries({ queryKey: ["dm", "unread"] }))
      .catch(() => undefined);
  }, [lastId, peer, qc]);

  const peerAuthor = thread.data?.peer;
  const peerKey = peerKeys.data?.current ?? null;
  const limit = thread.data?.limits.requestMessages ?? 3;
  const pendingFull = Boolean(thread.data?.pending && (thread.data?.sentCount ?? 0) >= limit);

  async function send(payload: DmPayload) {
    if (!kp || !peerKey) return;
    setSending(true);
    setError(null);
    try {
      await sendDm({ me, to: peer, kp, peerKey, payload });
      await qc.invalidateQueries({ queryKey: ["dm"] });
      return true;
    } catch (e) {
      const code = e instanceof ApiError ? String(e.body.error ?? "") : "";
      if (code === "stale_key") await qc.invalidateQueries({ queryKey: ["dm-keys"] });
      const known = [
        "recipient_no_key",
        "request_pending",
        "request_quota",
        "rate_limited",
        "not_registered",
        "blocked",
        "stale_key",
      ];
      setError(t(`errors.${known.includes(code) ? code : "generic"}`));
      return false;
    } finally {
      setSending(false);
    }
  }

  async function submit() {
    const v = text.trim();
    if (!v || sending) return;
    if (await send({ v: 1, t: "text", text: v.slice(0, DM_MAX_TEXT) })) {
      setText("");
      setTray(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  }

  async function react(f: Folded, emoji: string) {
    setPicker(null);
    await send({ v: 1, t: "react", to: f.m.id, emoji: f.reactions.mine === emoji ? "" : emoji });
  }

  // Mở khay emoji: kéo xuống cuối để tin mới nhất không bị khay che.
  useEffect(() => {
    if (tray)
      requestAnimationFrame(() => bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" }));
  }, [tray]);

  const lastMine = [...folded].reverse().find((f) => f.m.sender === me);
  const href = peerAuthor ? profileHref(peerAuthor) : null;

  return (
    <div className="flex min-h-dvh flex-col md:min-h-[calc(100dvh-56px)]">
      {/* Header cuộc trò chuyện */}
      <div className="glass sticky top-0 z-20 flex h-14 md:top-14 items-center gap-2 border-b border-[var(--line)] px-2">
        <Link
          href="/messages"
          aria-label={tc("back")}
          className="press flex h-10 w-10 items-center justify-center text-[var(--ink)]"
        >
          <Icon name="left" className="h-6 w-6" />
        </Link>
        {peerAuthor ? (
          <Link href={href ?? "#"} className="flex min-w-0 flex-1 items-center gap-2.5">
            <Avatar author={peerAuthor} size={34} />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold leading-tight">
                {displayName(peerAuthor)}
              </span>
              <span className="flex items-center gap-1 truncate text-[12px] text-[var(--muted)]">
                {peerAuthor.contractsDeployed > 0 ? (
                  <>
                    <Icon name="cube" className="h-3 w-3 text-[var(--accent)]" />
                    {t("contracts", { n: peerAuthor.contractsDeployed })}
                  </>
                ) : (
                  handleOf(peerAuthor)
                )}
              </span>
            </span>
          </Link>
        ) : (
          <div className="skeleton h-8 w-40 rounded-full" />
        )}
      </div>

      {/* Tin nhắn */}
      <div className="flex-1 px-3 pt-3 pb-2" data-testid="dm-messages">
        <p className="mx-auto mb-4 flex w-fit items-center gap-1.5 rounded-full bg-[var(--soft)] px-3 py-1 text-[11px] text-[var(--muted)]">
          <Icon name="lock" className="h-3 w-3" />
          {t("e2e")}
        </p>
        {thread.isPending && <Spinner />}
        {thread.data && !peerKeys.isPending && !peerKey && <Empty icon="lock" text={t("peerNoKey")} />}
        <ul className="space-y-1.5">
          {folded.map((f, i) => {
            const mine = f.m.sender === me;
            const prev = folded[i - 1];
            const grouped = prev && prev.m.sender === f.m.sender;
            const fresh = firstMax.current !== null && f.m.id > firstMax.current;
            const big = f.text !== null && isEmojiOnly(f.text);
            const reacts = [f.reactions.theirs, f.reactions.mine].filter(Boolean) as string[];
            return (
              <li
                key={f.m.id}
                className={`flex flex-col ${mine ? "items-end" : "items-start"} ${grouped ? "" : "pt-2"} ${fresh ? styles.rise : ""}`}
                data-testid="dm-message"
                data-mine={mine}
              >
                {picker === f.m.id && (
                  <div
                    className={`${styles.pop} mb-1 flex gap-0.5 rounded-full bg-[var(--bg)] p-1 shadow-lg ring-1 ring-[var(--line)]`}
                    data-testid="dm-reaction-picker"
                  >
                    {DM_QUICK_REACTIONS.map((e, k) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => void react(f, e)}
                        aria-label={`${t("react")} ${e}`}
                        className={`${styles.pop} press flex h-10 w-10 items-center justify-center rounded-full text-[24px] ${
                          f.reactions.mine === e ? "bg-[var(--accent)]/15" : "hover:bg-[var(--soft)]"
                        }`}
                        style={{ animationDelay: `${k * 25}ms` }}
                      >
                        <EmojiText text={e} size="26px" />
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => f.text !== null && setPicker(picker === f.m.id ? null : f.m.id)}
                  className={`max-w-[78%] text-left ${
                    big
                      ? `${fresh ? styles.big : ""} text-[44px] leading-none`
                      : `rounded-[20px] px-3.5 py-2 text-[15px] leading-snug whitespace-pre-wrap break-words ${
                          mine ? "bg-[var(--ink)] text-[var(--bg)]" : "bg-[var(--soft)] text-[var(--ink)]"
                        }`
                  }`}
                  data-testid="dm-bubble"
                >
                  {f.text !== null ? (
                    <EmojiText text={f.text} size={big ? "48px" : "1.25em"} />
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[13px] opacity-70">
                      <Icon name="lock" className="h-3 w-3" />
                      {f.reason === "old-key"
                        ? t("oldKey")
                        : f.reason === "unverified"
                          ? t("unverified")
                          : t("locked")}
                    </span>
                  )}
                </button>
                {reacts.length > 0 && (
                  <span
                    className={`${styles.pop} -mt-1.5 flex items-center gap-0.5 rounded-full border-2 border-[var(--bg)] bg-[var(--soft)] px-1.5 py-0.5`}
                    data-testid="dm-reactions"
                  >
                    {reacts.map((e, k) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: tối đa 2 phần tử (mình + người kia)
                      <EmojiText key={k} text={e} size="15px" />
                    ))}
                  </span>
                )}
                {lastMine?.m.id === f.m.id && (thread.data?.peerReadId ?? 0) >= f.m.id && (
                  <span className="mt-0.5 px-1 text-[11px] text-[var(--muted)]">{t("seen")}</span>
                )}
              </li>
            );
          })}
        </ul>
        <div ref={bottom} />
      </div>

      {/* Yêu cầu từ người lạ */}
      {thread.data?.box === "requests" && (
        <div
          className={`${styles.rise} mx-3 mb-2 rounded-2xl bg-[var(--soft)] p-3`}
          data-testid="dm-request-banner"
        >
          <p className="text-[13px] text-[var(--muted)]">{t("requestBanner")}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="press h-9 flex-1 rounded-full border border-[var(--line)] bg-[var(--bg)] text-[13px] font-semibold"
              onClick={() =>
                void api(`/dm/threads/${peer}/state`, { method: "POST", json: { state: "declined" } }).then(
                  () => qc.invalidateQueries({ queryKey: ["dm"] }),
                )
              }
            >
              {t("decline")}
            </button>
            <button
              type="button"
              className="press h-9 flex-1 rounded-full bg-[var(--ink)] text-[13px] font-semibold text-[var(--bg)]"
              onClick={() =>
                void api(`/dm/threads/${peer}/state`, { method: "POST", json: { state: "accepted" } }).then(
                  () => qc.invalidateQueries({ queryKey: ["dm"] }),
                )
              }
              data-testid="dm-request-accept"
            >
              {t("accept")}
            </button>
          </div>
        </div>
      )}

      {/* Composer */}
      <div className="sticky bottom-0 z-20 border-t border-[var(--line)] bg-[var(--bg)] px-3 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))] md:pb-2">
        {error && <p className="px-2 pb-1.5 text-[12px] text-[var(--accent)]">{error}</p>}
        {thread.data?.pending && peerKey && (
          <p className="px-2 pb-1.5 text-[11px] text-[var(--muted)]">
            {pendingFull ? t("pendingFull") : t("pending", { n: thread.data.sentCount, max: limit })}
          </p>
        )}
        <div className="flex items-end gap-2">
          <div className="flex min-h-[42px] flex-1 items-end rounded-[22px] bg-[var(--soft)] pl-4">
            <textarea
              ref={input}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, DM_MAX_TEXT))}
              onKeyDown={onKey}
              onFocus={() => setTray(false)}
              rows={1}
              placeholder={t("placeholder")}
              disabled={!peerKey || pendingFull}
              className="max-h-32 min-h-[42px] flex-1 resize-none bg-transparent py-[11px] text-[15px] leading-5 outline-none [field-sizing:content] placeholder:text-[var(--muted)] disabled:opacity-50"
              data-testid="dm-input"
            />
            <button
              type="button"
              onClick={() => {
                setTray((v) => !v);
                if (tray) input.current?.focus();
              }}
              aria-label={t("emoji")}
              aria-pressed={tray}
              disabled={!peerKey || pendingFull}
              className={`press flex h-[42px] w-11 shrink-0 items-center justify-center disabled:opacity-40 ${
                tray ? "text-[var(--accent)]" : "text-[var(--muted)]"
              }`}
              data-testid="dm-emoji-toggle"
            >
              <DmIcon name={tray ? "keyboard" : "smile"} className="h-[22px] w-[22px]" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!text.trim() || sending || !peerKey || pendingFull}
            aria-label={t("send")}
            className="press flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white transition-opacity disabled:opacity-30"
            data-testid="dm-send"
          >
            {sending ? <Spinner /> : <Icon name="send" className="h-[19px] w-[19px]" />}
          </button>
        </div>
        {tray && (
          <div
            className={`${styles.tray} mt-2 grid max-h-[208px] grid-cols-8 gap-0.5 overflow-y-auto`}
            data-testid="dm-emoji-tray"
          >
            {EMOJI_PICKER.map((e, k) => (
              <button
                key={e.code}
                type="button"
                onClick={() => setText((v) => (v + e.char).slice(0, DM_MAX_TEXT))}
                aria-label={e.char}
                className={`${styles.pop} press flex aspect-square items-center justify-center rounded-xl hover:bg-[var(--soft)]`}
                style={{ animationDelay: `${Math.min(k, 24) * 8}ms` }}
                data-testid="dm-emoji"
              >
                <EmojiText text={e.char} size="28px" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
