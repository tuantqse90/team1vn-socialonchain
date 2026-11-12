"use client";

import { MODERATION_STACKS } from "@socialonchain/feed-sdk";
import {
  DEFAULT_SESSION_DAYS,
  DEFAULT_SESSION_FUNDING_WEI,
  identityRegistryAbi,
} from "@socialonchain/protocol";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";
import { useDisconnect } from "wagmi";
import { Button, Ring } from "@/components/bits";
import { Icon, type IconName } from "@/components/Icon";
import { clientConfig } from "@/configs";
import { api } from "@/lib/api";
import { addressUrl, contracts } from "@/lib/chain";
import { useMyModeration, useUpdateSettings } from "@/lib/feeds";
import { formatAvax, shortAddr } from "@/lib/format";
import { LOW_GAS_WEI, sweepKey, useSession } from "@/lib/session";
import { useTx } from "@/lib/tx";
import { useMainWallet } from "@/lib/wallet";

/** Safety luôn bật (ẩn nội dung bất hợp pháp/doxxing): không cho tắt ở client A. */
const LOCKED = new Set(["mod:safety"]);

function Section({
  id,
  icon,
  title,
  children,
}: {
  id?: string;
  icon: IconName;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="border-b border-[var(--line)] px-4 py-5">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        <Icon name={icon} className="h-4 w-4" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-full bg-[var(--soft)] p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`press flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-medium ${
            value === o.id ? "bg-[var(--bg)] shadow-sm" : "text-[var(--muted)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  on,
  onChange,
  disabled,
  testId,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      data-testid={testId}
      className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-[var(--accent)]" : "bg-[var(--line)]"}`}
    >
      <span
        className={`absolute top-[3px] h-6 w-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[23px]" : "translate-x-[3px]"}`}
      />
    </button>
  );
}

export default function SettingsPage() {
  const t = useTranslations("settings");
  const ts = useTranslations("session");
  const tm = useTranslations("moderation");
  const tn = useTranslations("nav");
  const tp = useTranslations("profile");
  const tc = useTranslations("common");
  const locale = useLocale() as "en" | "vi";
  const router = useRouter();
  const qc = useQueryClient();
  const { status, owner, me, session, sessionBalance, prepareKey, discardKey, refresh, token } = useSession();
  const { track } = useTx();
  const { writeContract: writeContractAsync, sendTransaction: sendTransactionAsync } = useMainWallet();
  const { disconnect } = useDisconnect();
  const updateSettings = useUpdateSettings();
  const moderation = useMyModeration();
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  const [profile, setProfile] = useState({ displayName: "", bio: "", avatarUrl: "" });
  const [savedProfile, setSavedProfile] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      setTheme((localStorage.getItem("soc:theme") as "system" | "light" | "dark") || "system");
    } catch {
      // bỏ qua
    }
  }, []);
  useEffect(() => {
    if (me?.profile)
      setProfile({
        displayName: me.profile.displayName ?? "",
        bio: me.profile.bio ?? "",
        avatarUrl: me.profile.avatarUrl ?? "",
      });
  }, [me?.profile]);

  function applyTheme(v: "system" | "light" | "dark") {
    setTheme(v);
    try {
      localStorage.setItem("soc:theme", v);
    } catch {
      // bỏ qua
    }
    const dark = v === "dark" || (v === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }

  async function setLocale(v: "en" | "vi") {
    // biome-ignore lint/suspicious/noDocumentCookie: cookie ngôn ngữ đơn giản, server đọc qua next-intl
    document.cookie = `locale=${v}; path=/; max-age=31536000; samesite=lax`;
    if (token) await updateSettings({ locale: v }).catch(() => undefined);
    router.refresh();
  }

  async function toggleMod(id: string, on: boolean) {
    const next = on ? [...new Set([...moderation, id])] : moderation.filter((x) => x !== id);
    await updateSettings({ moderation: next });
  }

  async function topUp() {
    if (!session) return;
    await track(ts("topUp"), () =>
      sendTransactionAsync({ to: session.address, value: DEFAULT_SESSION_FUNDING_WEI }),
    );
    refresh();
  }

  async function renew() {
    if (!contracts || !owner) return;
    setBusy(true);
    const old = session;
    const key = prepareKey(DEFAULT_SESSION_DAYS);
    const ok = await track(ts("renew"), () =>
      writeContractAsync({
        address: contracts!.IdentityRegistry,
        abi: identityRegistryAbi,
        functionName: "addDelegate",
        args: [key.address, BigInt(key.expiresAt)],
        value: DEFAULT_SESSION_FUNDING_WEI,
      }),
    );
    if (ok && old) {
      // Key cũ: trả gas dư về owner, rồi thu hồi nếu còn hạn (key cũ không còn trên thiết bị).
      await sweepKey(old.pk, owner).catch(() => null);
      if (old.expiresAt > Date.now() / 1000) {
        await track(ts("revoke"), () =>
          writeContractAsync({
            address: contracts!.IdentityRegistry,
            abi: identityRegistryAbi,
            functionName: "removeDelegate",
            args: [old.address],
          }),
        );
      }
    }
    setBusy(false);
    refresh();
  }

  async function revoke() {
    if (!contracts || !owner || !session) return;
    setBusy(true);
    await sweepKey(session.pk, owner).catch(() => null);
    const ok = await track(ts("revoke"), () =>
      writeContractAsync({
        address: contracts!.IdentityRegistry,
        abi: identityRegistryAbi,
        functionName: "removeDelegate",
        args: [session.address],
      }),
    );
    if (ok) discardKey();
    setBusy(false);
    refresh();
  }

  async function saveProfile() {
    await api("/me/profile", {
      method: "PUT",
      json: {
        displayName: profile.displayName.trim() || null,
        bio: profile.bio.trim() || null,
        avatarUrl: profile.avatarUrl.trim() || null,
      },
    });
    await qc.invalidateQueries();
    setSavedProfile(true);
    setTimeout(() => setSavedProfile(false), 1500);
  }

  const daysLeft = session ? Math.max(0, Math.ceil((session.expiresAt - Date.now() / 1000) / 86400)) : 0;
  const low = sessionBalance !== undefined && sessionBalance < LOW_GAS_WEI;

  return (
    <div>
      <h1 className="px-4 pt-4 pb-1 text-[22px] font-bold tracking-tight">{t("title")}</h1>

      {status !== "disconnected" && (
        <Section id="session" icon="key" title={ts("title")}>
          {session && status === "ready" ? (
            <div className="space-y-3" data-testid="session-card">
              <div className="flex items-center gap-4 rounded-3xl bg-[var(--soft)] p-4">
                <Ring
                  value={Number(sessionBalance ?? 0n) / Number(DEFAULT_SESSION_FUNDING_WEI)}
                  danger={low}
                  size={44}
                  stroke={5}
                />
                <div className="min-w-0 flex-1">
                  <div className="mono text-[17px] font-semibold">
                    {formatAvax(sessionBalance ?? 0n, 4)} AVAX
                  </div>
                  <div className="mono flex items-center gap-2 text-[12px] text-[var(--muted)]">
                    {addressUrl(session.address) ? (
                      <a
                        href={addressUrl(session.address) ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {shortAddr(session.address)}
                      </a>
                    ) : (
                      shortAddr(session.address)
                    )}
                    <span>·</span>
                    <span>{ts("daysLeft", { days: daysLeft })}</span>
                  </div>
                </div>
                {low && <Icon name="fuel" className="h-5 w-5 text-[var(--accent)]" />}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" onClick={() => void topUp()} disabled={busy} testId="topup">
                  <Icon name="fuel" className="h-4 w-4" />
                  <span className="text-[12px]">{ts("topUp")}</span>
                </Button>
                <Button variant="outline" onClick={() => void renew()} disabled={busy} testId="renew">
                  <Icon name="key" className="h-4 w-4" />
                  <span className="text-[12px]">30d</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void revoke()}
                  disabled={busy}
                  testId="revoke"
                  className="text-[var(--accent)]"
                >
                  <Icon name="x" className="h-4 w-4" />
                  <span className="text-[12px]">{ts("revoke")}</span>
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-[var(--muted)]">{ts("none")}</span>
              <Link
                href="/welcome"
                className="press rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
              >
                <Icon name="key" className="h-4 w-4" />
              </Link>
            </div>
          )}
        </Section>
      )}

      {status === "ready" && (
        <Section icon="shield" title={t("moderation")}>
          <ul className="space-y-1" data-testid="moderation">
            {Object.keys(MODERATION_STACKS).map((id) => {
              const on = moderation.includes(id) || LOCKED.has(id);
              return (
                <li key={id} className="flex items-center gap-3 py-1.5">
                  <span className="flex-1 text-[15px]">{tm(id as "mod:safety")}</span>
                  <Toggle
                    on={on}
                    disabled={LOCKED.has(id)}
                    onChange={(v) => void toggleMod(id, v)}
                    testId={`mod-${id}`}
                  />
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {status === "ready" && (
        <Section id="profile" icon="user" title={t("profile")}>
          <div className="space-y-2">
            <input
              className="field"
              placeholder={tp("displayName")}
              value={profile.displayName}
              onChange={(e) => setProfile({ ...profile, displayName: e.target.value.slice(0, 50) })}
            />
            <textarea
              className="field resize-none"
              rows={3}
              placeholder={tp("bio")}
              value={profile.bio}
              onChange={(e) => setProfile({ ...profile, bio: e.target.value.slice(0, 280) })}
            />
            <input
              className="field"
              placeholder={tp("avatar")}
              value={profile.avatarUrl}
              onChange={(e) => setProfile({ ...profile, avatarUrl: e.target.value.slice(0, 500) })}
              inputMode="url"
            />
            <Button variant="solid" onClick={() => void saveProfile()} className="w-full">
              <Icon name="check" className="h-4 w-4" />
              {savedProfile ? tc("saved") : tc("save")}
            </Button>
          </div>
        </Section>
      )}

      <Section icon="globe" title={t("language")}>
        <Segmented
          value={locale}
          onChange={(v) => void setLocale(v)}
          options={[
            { id: "en", label: "English" },
            { id: "vi", label: "Tiếng Việt" },
          ]}
        />
      </Section>

      <Section icon="moon" title={t("theme")}>
        <Segmented
          value={theme}
          onChange={applyTheme}
          options={[
            { id: "system", label: <Icon name="pulse" className="h-4 w-4" /> },
            { id: "light", label: <Icon name="sun" className="h-4 w-4" /> },
            { id: "dark", label: <Icon name="moon" className="h-4 w-4" /> },
          ]}
        />
      </Section>

      {status === "ready" && (
        <Section icon="pulse" title={t("analytics")}>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--muted)]">{t("analytics")}</span>
            <Toggle
              on={!(me?.settings?.analyticsOptOut ?? false)}
              onChange={(v) => void updateSettings({ analyticsOptOut: !v })}
            />
          </div>
        </Section>
      )}

      <nav className="grid grid-cols-4 gap-2 px-4 py-5">
        {(
          [
            { href: "/billing", icon: "coin", label: tn("billing") },
            { href: "/import", icon: "arch", label: tn("import") },
            { href: "/status", icon: "pulse", label: tn("status") },
            ...(me?.admin ? [{ href: "/admin", icon: "shield", label: tn("admin") }] : []),
          ] as { href: string; icon: IconName; label: string }[]
        ).map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="press flex flex-col items-center gap-1.5 rounded-2xl bg-[var(--soft)] py-3 text-[11px] text-[var(--muted)]"
          >
            <Icon name={l.icon} className="h-5 w-5 text-[var(--ink)]" />
            {l.label}
          </Link>
        ))}
      </nav>

      {status !== "disconnected" && (
        <div className="px-4 pb-8">
          <Button variant="ghost" className="w-full text-[var(--muted)]" onClick={() => disconnect()}>
            <Icon name="logout" className="h-4 w-4" />
            {t("disconnect")}
          </Button>
          <p className="mono mt-3 text-center text-[10px] text-[var(--muted)]">
            {clientConfig.appName} · {owner ? shortAddr(owner) : ""}
          </p>
        </div>
      )}
    </div>
  );
}
