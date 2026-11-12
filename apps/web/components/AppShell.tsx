"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { DEFAULT_SESSION_FUNDING_WEI } from "@socialonchain/protocol";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { clientConfig } from "@/configs";
import { api } from "@/lib/api";
import { network } from "@/lib/chain";
import { gasLevel, useSession } from "@/lib/session";
import { useCompose } from "./Compose";
import { InboxButton } from "./dm/InboxButton";
import { Icon, type IconName } from "./Icon";
import { Logo } from "./Logo";
import { NetworkGuard } from "./NetworkGuard";
import { RightRail } from "./RightRail";
import { useTopUp } from "./TopUpSheet";

type NavItem = { href: string; icon: IconName; key: string; label: string; match: (p: string) => boolean };

function useUnread() {
  const { token } = useSession();
  return useQuery({
    queryKey: ["unread", token],
    queryFn: () => api<{ unread: number }>("/notifications").then((r) => r.unread),
    enabled: Boolean(token),
    refetchInterval: 30_000,
  });
}

const RING = 62.83; // 2π × 10

/**
 * Chip gas của session key: vòng (số dư / 0.05 AVAX) + icon key + số dư 4 chữ số.
 * Thấp/hết gas: nền blush, vòng đỏ có quầng, dấu "+", bấm là mở sheet nạp. Nảy nhẹ sau mỗi tx tiêu gas.
 */
export function SessionChip({ className = "" }: { className?: string }) {
  const t = useTranslations("chip");
  const { status, sessionBalance } = useSession();
  const topUp = useTopUp();
  const prev = useRef<bigint | undefined>(undefined);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (sessionBalance !== undefined && prev.current !== undefined && sessionBalance < prev.current)
      setBump((b) => b + 1);
    prev.current = sessionBalance;
  }, [sessionBalance]);

  if (status !== "ready" || sessionBalance === undefined) return null;
  const level = gasLevel(sessionBalance);
  const low = level !== "ok";
  const frac = Math.min(1, Number(sessionBalance) / Number(DEFAULT_SESSION_FUNDING_WEI));
  const val = (Number(sessionBalance) / 1e18).toFixed(4);
  const aria = `${level === "empty" ? t("keyEmpty") : low ? t("keyLow") : t("key")}: ${val} AVAX`;

  const pill = (
    <span
      key={bump}
      className={`flex h-8 items-center gap-1.5 rounded-full pr-2.5 pl-1 transition-colors duration-300 ${bump ? "anim-bump" : ""} ${
        low ? "bg-[var(--blush)] text-[var(--red-ink)]" : "bg-[var(--soft)] text-[var(--ink)]"
      }`}
    >
      <span className={`relative h-6 w-6 shrink-0 rounded-full ${low ? "anim-halo" : ""}`}>
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden className="block">
          <circle
            cx="12"
            cy="12"
            r="10"
            fill="none"
            strokeWidth="2.4"
            style={{ stroke: low ? "color-mix(in srgb, var(--accent) 28%, transparent)" : "var(--line)" }}
          />
          <circle
            cx="12"
            cy="12"
            r="10"
            fill="none"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeDasharray={RING}
            strokeDashoffset={(RING * (1 - frac)).toFixed(2)}
            transform="rotate(-90 12 12)"
            style={{
              stroke: low ? "var(--accent)" : "var(--ink)",
              transition: "stroke-dashoffset .6s var(--spring), stroke .3s",
            }}
          />
          <path
            d="M7.2 14.6a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0-4.8 0M11.3 12.9L16 8.2M14.4 9.8l1.6 1.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="mono text-[13px] font-semibold tabular-nums">{val}</span>
      <span className={`mono text-[10px] font-semibold ${low ? "" : "text-[var(--muted)]"}`}>AVAX</span>
      {low && <Icon name="plus" className="h-3 w-3" strokeWidth={3} />}
    </span>
  );
  const cls = `press flex h-11 shrink-0 items-center ${className}`;
  return low ? (
    <button
      type="button"
      onClick={() => topUp.open(level)}
      aria-label={aria}
      title={aria}
      data-testid="session-badge"
      className={cls}
    >
      {pill}
    </button>
  ) : (
    <Link href="/settings#session" aria-label={aria} title={aria} data-testid="session-badge" className={cls}>
      {pill}
    </Link>
  );
}

/** Tên cũ, giữ cho code khác còn import. */
export const SessionBadge = SessionChip;

/** Kết nối ví / tham gia (đăng ký, bật thiết bị). Khi đã sẵn sàng thì không hiện (hồ sơ nằm ở tab bar). */
function AccountButton() {
  const tc = useTranslations("common");
  const t = useTranslations("tabbar");
  const { status } = useSession();
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
        aria-label={t("join")}
        title={t("join")}
        className="press flex h-9 items-center gap-2 rounded-full bg-[var(--accent)] px-3.5 text-sm font-semibold text-[var(--accent-ink)]"
        data-testid="join"
      >
        <Icon name={status === "unregistered" ? "userplus" : "key"} className="h-4 w-4" />
      </Link>
    );
  }
  return null;
}

/** Một tab chỉ icon: đang chọn thì icon đặc + vạch đỏ 16×4 bung từ 0.25 → 1; bấm thu 0.84. */
function Tab({
  item,
  active,
  live,
  dot = false,
  ariaLabel,
  size,
}: {
  item: NavItem;
  active: boolean;
  live: boolean;
  dot?: boolean;
  ariaLabel?: string;
  size: string;
}) {
  const fill = active && item.icon !== "search" && item.icon !== "layers" && item.icon !== "gear";
  return (
    <Link
      href={item.href}
      aria-label={ariaLabel ?? item.label}
      aria-current={active ? "page" : undefined}
      title={item.label}
      data-testid={`nav-${item.key}`}
      className={`group flex flex-col items-center justify-center gap-[5px] ${size} ${
        active ? "text-[var(--ink)]" : "text-[var(--muted)] hover:text-[var(--ink)]"
      }`}
    >
      <span
        className="relative flex transition-transform duration-[550ms] ease-[var(--bouncy)] group-active:scale-[.84] group-active:duration-[140ms] group-active:ease-[var(--press)]"
        style={{ transform: active && !live ? "translateY(4px) scale(.7)" : undefined }}
      >
        <Icon name={item.icon} filled={fill} strokeWidth={active ? 2.2 : 1.8} className="h-[26px] w-[26px]" />
        {dot && (
          <span className="anim-pop absolute top-px right-0 h-2.5 w-2.5 rounded-full border-2 border-[var(--bg)] bg-[var(--accent)]" />
        )}
      </span>
      <span
        aria-hidden
        className={`h-1 w-4 rounded-[2px] ${active ? "bg-[var(--accent)]" : "bg-transparent"}`}
        style={{
          transform: `scaleX(${active && live ? 1 : 0.25})`,
          transition: "transform .55s var(--bouncy), background-color .2s",
        }}
      />
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations("tabbar");
  const pathname = usePathname() || "/";
  const { status, owner } = useSession();
  const compose = useCompose();
  const unread = useUnread();
  const [live, setLive] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setLive(true), 60);
    return () => clearTimeout(id);
  }, []);
  const profileHref = owner ? `/u/${owner.toLowerCase()}` : "/welcome";

  const home: NavItem = { href: "/", icon: "home", key: "home", label: t("home"), match: (p) => p === "/" };
  const explore: NavItem = {
    href: "/search",
    icon: "search",
    key: "search",
    label: t("explore"),
    match: (p) => p.startsWith("/search"),
  };
  const feeds: NavItem = {
    href: "/feeds",
    icon: "layers",
    key: "feeds",
    label: t("feeds"),
    match: (p) => p.startsWith("/feeds"),
  };
  const notifs: NavItem = {
    href: "/notifications",
    icon: "bell",
    key: "notifications",
    label: t("notifs"),
    match: (p) => p.startsWith("/notifications"),
  };
  const profile: NavItem = {
    href: profileHref,
    icon: "user",
    key: "profile",
    label: t("profile"),
    match: (p) => Boolean(owner) && p === profileHref,
  };
  const settings: NavItem = {
    href: "/settings",
    icon: "gear",
    key: "settings",
    label: t("settings"),
    match: (p) => p.startsWith("/settings"),
  };

  const bare = pathname.startsWith("/welcome");
  // Thread và khung chat có header riêng (quay lại + tiêu đề) và thanh nhập dính đáy: ẩn header + tab bar trên mobile.
  const thread = pathname.startsWith("/p/") || /^\/messages\/[^/]+/.test(pathname);
  const dot = (unread.data ?? 0) > 0 && !notifs.match(pathname);
  const tab = (i: NavItem, size: string) => (
    <Tab
      key={i.key}
      item={i}
      active={i.match(pathname)}
      live={live}
      size={size}
      dot={i.key === "notifications" && dot}
      ariaLabel={i.key === "notifications" && dot ? t("notifsUnread") : undefined}
    />
  );

  return (
    <div className="relative isolate mx-auto flex min-h-dvh w-full max-w-[1080px] xl:max-w-[1220px]">
      {/* Nền ambient (quầng đỏ + lưới chấm) chỉ trên desktop; cột nội dung vẫn nền đặc. */}
      {!bare && (
        <div aria-hidden className="ambient pointer-events-none fixed inset-0 -z-10 hidden md:block" />
      )}
      {/* Rail dọc trên desktop */}
      {!bare && (
        <nav
          aria-label={t("nav")}
          className="sticky top-0 hidden h-dvh w-[76px] shrink-0 flex-col items-center gap-1 py-5 md:flex"
        >
          <Link href="/" className="press mb-4" aria-label={clientConfig.appName}>
            <Logo size={34} />
          </Link>
          {[home, explore, feeds, notifs, profile].map((i) => tab(i, "h-14 w-14"))}
          <InboxButton variant="rail" />
          <button
            type="button"
            onClick={() => compose.open()}
            aria-label={t("compose")}
            title={t("compose")}
            className="press compose-glow mt-2 flex h-[42px] w-[54px] items-center justify-center rounded-2xl"
            data-testid="compose-rail"
          >
            <Icon name="plus" className="h-[22px] w-[22px]" strokeWidth={2.3} />
          </button>
          <div className="flex-1" />
          {tab(settings, "h-14 w-14")}
        </nav>
      )}

      <div className="flex min-w-0 flex-1 justify-center">
        <div
          className={`w-full ${bare ? "max-w-[520px]" : "max-w-[620px] md:border-x md:border-[var(--line)] md:bg-[var(--bg)]"} min-h-dvh ${
            thread ? "md:pb-0" : "pb-24 md:pb-8"
          }`}
        >
          {!bare && (
            <header
              className={`glass sticky top-0 z-30 flex h-14 items-center gap-1.5 px-2.5 md:px-4 ${thread ? "max-md:hidden" : ""}`}
            >
              <Link
                href="/"
                className="press absolute left-1/2 -translate-x-1/2 md:hidden"
                aria-label={clientConfig.appName}
              >
                <Logo size={30} />
              </Link>
              <span className="mono hidden items-center gap-1.5 rounded-full bg-[var(--soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--muted)] uppercase md:inline-flex xl:hidden">
                <span className="live-dot" style={{ width: 6, height: 6 }} aria-hidden />
                {network.name === "fuji" ? "Fuji" : "Local"}
              </span>
              <div className="flex-1" />
              <NetworkGuard />
              <InboxButton />
              <SessionChip className="max-md:order-first" />
              {status !== "ready" && (
                <Link
                  href="/settings"
                  aria-label={t("settings")}
                  title={t("settings")}
                  className="press flex h-11 w-11 items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] md:hidden"
                  data-testid="nav-settings"
                >
                  <Icon name="gear" className="h-[22px] w-[22px]" />
                </Link>
              )}
              <AccountButton />
            </header>
          )}
          <main>{children}</main>
        </div>
      </div>

      {!bare && <RightRail />}

      {/* Tab bar mobile: chỉ icon */}
      {!bare && !thread && (
        <nav
          aria-label={t("nav")}
          className="glass pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] md:hidden"
        >
          <div className="mx-auto grid h-[50px] max-w-[520px] grid-cols-5 px-2">
            {tab(home, "h-[50px]")}
            {tab(explore, "h-[50px]")}
            <button
              type="button"
              onClick={() => compose.open()}
              aria-label={t("compose")}
              title={t("compose")}
              disabled={status === "disconnected"}
              className="group flex h-[50px] items-center justify-center disabled:opacity-40"
              data-testid="compose-tab"
            >
              <span className="compose-glow flex h-[38px] w-[54px] items-center justify-center rounded-2xl transition-transform duration-[550ms] ease-[var(--bouncy)] group-active:scale-[.84] group-active:duration-[140ms] group-active:ease-[var(--press)]">
                <Icon name="plus" className="h-[22px] w-[22px]" strokeWidth={2.3} />
              </span>
            </button>
            {tab(notifs, "h-[50px]")}
            {tab(profile, "h-[50px]")}
          </div>
        </nav>
      )}
    </div>
  );
}
