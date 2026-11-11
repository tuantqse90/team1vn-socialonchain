"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { DEFAULT_SESSION_FUNDING_WEI } from "@socialonchain/protocol";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { clientConfig } from "@/configs";
import { api } from "@/lib/api";
import { network } from "@/lib/chain";
import { formatAvax } from "@/lib/format";
import { LOW_GAS_WEI, useSession } from "@/lib/session";
import { Avatar, Ring } from "./bits";
import { useCompose } from "./Compose";
import { Icon, type IconName } from "./Icon";
import { Logo } from "./Logo";

type NavItem = { href: string; icon: IconName; key: string; match: (p: string) => boolean };

function useUnread() {
  const { token } = useSession();
  return useQuery({
    queryKey: ["unread", token],
    queryFn: () => api<{ unread: number }>("/notifications").then((r) => r.unread),
    enabled: Boolean(token),
    refetchInterval: 30_000,
  });
}

/** Vòng gas của session key: bấm vào để mở settings. */
export function SessionBadge() {
  const t = useTranslations("session");
  const { status, sessionBalance } = useSession();
  if (status !== "ready" || sessionBalance === undefined) return null;
  const low = sessionBalance < LOW_GAS_WEI;
  return (
    <Link
      href="/settings#session"
      className="press flex items-center gap-1.5 rounded-full px-1.5 py-1 text-[var(--muted)] hover:text-[var(--ink)]"
      title={`${t("balance")}: ${formatAvax(sessionBalance)} AVAX`}
      data-testid="session-badge"
    >
      <Ring value={Number(sessionBalance) / Number(DEFAULT_SESSION_FUNDING_WEI)} danger={low} size={20} />
      <Icon name="fuel" className={`h-4 w-4 ${low ? "text-[var(--accent)]" : ""}`} />
    </Link>
  );
}

function AccountButton() {
  const tc = useTranslations("common");
  const { status, owner, me } = useSession();
  const { openConnectModal } = useConnectModal();
  if (status === "disconnected") {
    return (
      <button
        type="button"
        onClick={() => openConnectModal?.()}
        className="press flex h-9 items-center gap-2 rounded-full bg-[var(--ink)] px-3.5 text-sm font-semibold text-[var(--bg)]"
        data-testid="connect"
      >
        <Icon name="wallet" className="h-4 w-4" />
        <span className="hidden sm:inline">{tc("connect")}</span>
      </button>
    );
  }
  if (status === "unregistered" || status === "needs-key") {
    return (
      <Link
        href="/welcome"
        className="press flex h-9 items-center gap-2 rounded-full bg-[var(--accent)] px-3.5 text-sm font-semibold text-[var(--accent-ink)]"
        data-testid="join"
      >
        <Icon name={status === "unregistered" ? "userplus" : "key"} className="h-4 w-4" />
      </Link>
    );
  }
  if (!owner) return null;
  return (
    <Link href={`/u/${owner.toLowerCase()}`} className="press" aria-label="Profile">
      <Avatar
        size={32}
        author={{
          address: owner.toLowerCase(),
          handle: null,
          displayName: me?.profile?.displayName ?? null,
          avatarUrl: me?.profile?.avatarUrl ?? null,
          fid: null,
          fcUsername: null,
          contractsDeployed: 0,
        }}
      />
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const pathname = usePathname() || "/";
  const { status, owner } = useSession();
  const compose = useCompose();
  const unread = useUnread();
  const profileHref = owner ? `/u/${owner.toLowerCase()}` : "/welcome";

  const items: NavItem[] = [
    { href: "/", icon: "home", key: "home", match: (p) => p === "/" },
    { href: "/search", icon: "search", key: "search", match: (p) => p.startsWith("/search") },
    { href: "/feeds", icon: "layers", key: "feeds", match: (p) => p.startsWith("/feeds") },
    {
      href: "/notifications",
      icon: "bell",
      key: "notifications",
      match: (p) => p.startsWith("/notifications"),
    },
    { href: profileHref, icon: "user", key: "profile", match: (p) => Boolean(owner) && p === profileHref },
  ];
  const mobile = items.filter((i) => i.key !== "search");
  const bare = pathname.startsWith("/welcome");

  const navLink = (i: NavItem, size: string) => {
    const active = i.match(pathname);
    const badge = i.key === "notifications" && (unread.data ?? 0) > 0;
    return (
      <Link
        key={i.key}
        href={i.href}
        aria-label={t(i.key)}
        title={t(i.key)}
        data-testid={`nav-${i.key}`}
        className={`press relative flex items-center justify-center rounded-2xl ${size} ${
          active ? "text-[var(--ink)]" : "text-[var(--muted)] hover:text-[var(--ink)]"
        }`}
      >
        <Icon
          name={i.icon}
          className="h-[26px] w-[26px]"
          filled={active && i.key !== "search" && i.key !== "layers"}
        />
        {badge && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-[var(--accent)]" />}
      </Link>
    );
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1080px]">
      {/* Rail dọc trên desktop */}
      {!bare && (
        <nav className="sticky top-0 hidden h-dvh w-[76px] shrink-0 flex-col items-center gap-2 py-5 md:flex">
          <Link href="/" className="press mb-4" aria-label={clientConfig.appName}>
            <Logo size={34} />
          </Link>
          {items.map((i) => navLink(i, "h-14 w-14"))}
          <button
            type="button"
            onClick={() => compose.open()}
            aria-label={t("home")}
            className="press mt-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--soft)] text-[var(--ink)] hover:bg-[var(--line)]"
            data-testid="compose-rail"
          >
            <Icon name="plus" className="h-6 w-6" />
          </button>
          <div className="flex-1" />
          <Link
            href="/settings"
            aria-label={t("settings")}
            className="press flex h-12 w-12 items-center justify-center text-[var(--muted)] hover:text-[var(--ink)]"
          >
            <Icon name="gear" className="h-6 w-6" />
          </Link>
        </nav>
      )}

      <div className="flex min-w-0 flex-1 justify-center">
        <div
          className={`w-full ${bare ? "max-w-[520px]" : "max-w-[620px] md:border-x md:border-[var(--line)]"} min-h-dvh pb-24 md:pb-8`}
        >
          {!bare && (
            <header className="glass sticky top-0 z-30 flex h-14 items-center gap-2 px-4">
              <Link href="/" className="press md:hidden" aria-label={clientConfig.appName}>
                <Logo size={28} />
              </Link>
              {network.name !== "fuji" ? (
                <span className="mono rounded-full bg-[var(--soft)] px-2 py-0.5 text-[10px] uppercase text-[var(--muted)]">
                  {tc("local")}
                </span>
              ) : (
                <span className="mono rounded-full bg-[var(--soft)] px-2 py-0.5 text-[10px] uppercase text-[var(--muted)]">
                  Fuji
                </span>
              )}
              <div className="flex-1" />
              <Link
                href="/search"
                aria-label={t("search")}
                className="press flex h-9 w-9 items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] md:hidden"
              >
                <Icon name="search" className="h-[22px] w-[22px]" />
              </Link>
              <SessionBadge />
              <Link
                href="/settings"
                aria-label={t("settings")}
                className="press flex h-9 w-9 items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] md:hidden"
                data-testid="nav-settings"
              >
                <Icon name="gear" className="h-[22px] w-[22px]" />
              </Link>
              <AccountButton />
            </header>
          )}
          <main>{children}</main>
        </div>
      </div>

      {/* Tab bar kiểu iOS trên mobile: chỉ icon */}
      {!bare && (
        <nav className="glass pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] md:hidden">
          <div className="mx-auto flex h-[58px] max-w-[520px] items-center justify-around px-2">
            {mobile.slice(0, 2).map((i) => navLink(i, "h-12 w-14"))}
            <button
              type="button"
              onClick={() => compose.open()}
              aria-label="+"
              disabled={status === "disconnected"}
              className="press flex h-11 w-14 items-center justify-center rounded-2xl bg-[var(--soft)] text-[var(--ink)] disabled:opacity-40"
              data-testid="compose-tab"
            >
              <Icon name="plus" className="h-6 w-6" />
            </button>
            {mobile.slice(2).map((i) => navLink(i, "h-12 w-14"))}
          </div>
        </nav>
      )}
    </div>
  );
}
