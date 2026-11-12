"use client";

import { MODERATION_STACKS } from "@socialonchain/feed-sdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useDisconnect } from "wagmi";
import { Button } from "@/components/bits";
import { DmSettings } from "@/components/dm/DmSettings";
import { Icon, type IconName } from "@/components/Icon";
import { LicensesSheet } from "@/components/settings/LicensesSheet";
import { AutoIcon, Group, Row, Seg, Switch } from "@/components/settings/rows";
import { SessionCard } from "@/components/settings/SessionCard";
import { clientConfig } from "@/configs";
import { api } from "@/lib/api";
import { useMyModeration, useUpdateSettings } from "@/lib/feeds";
import { shortAddr } from "@/lib/format";
import { useSession } from "@/lib/session";

/** Safety luôn bật (ẩn nội dung bất hợp pháp/doxxing/NSFW): không cho tắt ở client A. */
const LOCKED = new Set(["mod:safety"]);
const MOD_ICON: Record<string, IconName> = {
  "mod:safety": "shield",
  "mod:no-toxic": "toxic",
  "mod:no-bait": "flame",
  "mod:no-shill": "coin",
  "mod:less-politics": "megaphone",
};

type Theme = "light" | "dark" | "system";
type Locale = "en" | "vi";

export default function SettingsPage() {
  const t = useTranslations("settings");
  const tm = useTranslations("moderation");
  const tn = useTranslations("nav");
  const tp = useTranslations("profile");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const qc = useQueryClient();
  const { status, owner, me, token } = useSession();
  const { disconnect } = useDisconnect();
  const updateSettings = useUpdateSettings();
  const moderation = useMyModeration();
  const [theme, setTheme] = useState<Theme>("system");
  const [lang, setLang] = useState<Locale>(locale);
  /** Bật/tắt lạc quan để công tắc trượt ngay, trước khi `me` được làm mới. */
  const [modPending, setModPending] = useState<Record<string, boolean>>({});
  const [profile, setProfile] = useState({ displayName: "", bio: "", avatarUrl: "" });
  const [savedProfile, setSavedProfile] = useState(false);
  const [licenses, setLicenses] = useState(false);

  const net = useQuery({
    queryKey: ["network"],
    queryFn: () => api<{ labelers: string[] }>("/network"),
    staleTime: 5 * 60_000,
  });
  const labeler = net.data?.labelers[0] ?? null;

  useEffect(() => {
    try {
      setTheme((localStorage.getItem("soc:theme") as Theme) || clientConfig.defaultTheme || "system");
    } catch {
      // bỏ qua
    }
  }, []);
  useEffect(() => setLang(locale), [locale]);
  useEffect(() => {
    if (me?.profile)
      setProfile({
        displayName: me.profile.displayName ?? "",
        bio: me.profile.bio ?? "",
        avatarUrl: me.profile.avatarUrl ?? "",
      });
  }, [me?.profile]);

  function applyTheme(v: Theme) {
    setTheme(v);
    try {
      localStorage.setItem("soc:theme", v);
    } catch {
      // bỏ qua
    }
    const dark = v === "dark" || (v === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }

  async function setLocale(v: Locale) {
    setLang(v);
    // biome-ignore lint/suspicious/noDocumentCookie: cookie ngôn ngữ đơn giản, server đọc qua next-intl
    document.cookie = `locale=${v}; path=/; max-age=31536000; samesite=lax`;
    if (token) await updateSettings({ locale: v }).catch(() => undefined);
    router.refresh();
  }

  async function toggleMod(id: string, on: boolean) {
    setModPending((p) => ({ ...p, [id]: on }));
    const next = on ? [...new Set([...moderation, id])] : moderation.filter((x) => x !== id);
    await updateSettings({ moderation: next }).catch(() => undefined);
    setModPending(({ [id]: _, ...rest }) => rest);
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

  const ready = status === "ready";
  const plan = me?.entitlements?.plan;

  return (
    <div className="px-4 pb-10">
      <h1 className="pb-4 pt-4 text-[22px] font-bold tracking-tight">{t("title")}</h1>

      <SessionCard />

      {ready && (
        <Group label={t("moderation")} testId="moderation">
          {Object.keys(MODERATION_STACKS).map((id) => {
            const locked = LOCKED.has(id);
            const on = locked || (modPending[id] ?? moderation.includes(id));
            const label = tm(id as "mod:safety");
            return (
              <Row key={id} icon={MOD_ICON[id] ?? "filter"} label={label}>
                <Switch
                  on={on}
                  locked={locked}
                  lockedLabel={t("alwaysOn")}
                  label={label}
                  onChange={(v) => void toggleMod(id, v)}
                  testId={`mod-${id}`}
                />
              </Row>
            );
          })}
        </Group>
      )}

      <DmSettings />

      <Group label={t("app")}>
        <Row icon="shield" label={t("labeler")} testId="settings-labeler">
          <span className="flex shrink-0 flex-col items-end leading-tight text-[var(--muted)]">
            <span className="text-[13px]">{t("labelerDefault")}</span>
            {labeler && <span className="mono text-[11px]">{shortAddr(labeler)}</span>}
          </span>
        </Row>
        {ready && plan && (
          <Row icon="crown" label={t("plan")} href="/billing" testId="settings-plan">
            <span
              className={`mono inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[11px] font-bold tracking-[.08em] ${
                plan === "pro" ? "bg-[var(--ink)] text-[var(--bg)]" : "bg-[var(--line)] text-[var(--ink)]"
              }`}
            >
              {plan === "pro" ? "PRO" : "FREE"}
            </span>
          </Row>
        )}
        <Row icon="globe" label={t("language")}>
          <Seg
            label={t("language")}
            value={lang}
            onChange={(v) => void setLocale(v)}
            testId="settings-lang"
            items={[
              {
                key: "vi",
                label: "Tiếng Việt",
                content: <span className="mono text-[13px] font-bold">VI</span>,
              },
              {
                key: "en",
                label: "English",
                content: <span className="mono text-[13px] font-bold">EN</span>,
              },
            ]}
          />
        </Row>
        <Row tile={<AutoIcon className="h-[17px] w-[17px]" />} label={t("theme")}>
          <Seg
            label={t("theme")}
            value={theme}
            onChange={applyTheme}
            testId="settings-theme"
            items={[
              { key: "light", label: t("light"), content: <Icon name="sun" className="h-[18px] w-[18px]" /> },
              { key: "dark", label: t("dark"), content: <Icon name="moon" className="h-[18px] w-[18px]" /> },
              { key: "system", label: t("system"), content: <AutoIcon /> },
            ]}
          />
        </Row>
        {ready && (
          <Row icon="bars" label={t("analytics")}>
            <Switch
              on={!(me?.settings?.analyticsOptOut ?? false)}
              label={t("analytics")}
              onChange={(v) => void updateSettings({ analyticsOptOut: !v })}
            />
          </Row>
        )}
        {ready && <Row icon="download" label={tn("import")} href="/import" />}
        <Row icon="pulse" label={tn("status")} href="/status" />
        {me?.admin && <Row icon="shield" label={tn("admin")} href="/admin" />}
        <Row icon="book" label={t("licenses")} onClick={() => setLicenses(true)} testId="settings-licenses" />
      </Group>

      {ready && (
        <Group id="profile" label={t("profile")} bare>
          <div className="space-y-2">
            <input
              className="field"
              placeholder={tp("displayName")}
              aria-label={tp("displayName")}
              value={profile.displayName}
              onChange={(e) => setProfile({ ...profile, displayName: e.target.value.slice(0, 50) })}
            />
            <textarea
              className="field resize-none"
              rows={3}
              placeholder={tp("bio")}
              aria-label={tp("bio")}
              value={profile.bio}
              onChange={(e) => setProfile({ ...profile, bio: e.target.value.slice(0, 280) })}
            />
            <input
              className="field"
              placeholder={tp("avatar")}
              aria-label={tp("avatar")}
              value={profile.avatarUrl}
              onChange={(e) => setProfile({ ...profile, avatarUrl: e.target.value.slice(0, 500) })}
              inputMode="url"
            />
            <Button variant="solid" onClick={() => void saveProfile()} className="h-11 w-full">
              <Icon name="check" className="h-4 w-4" />
              {savedProfile ? tc("saved") : tc("save")}
            </Button>
          </div>
        </Group>
      )}

      {status !== "disconnected" && (
        <div className="pt-8">
          <Button variant="ghost" className="h-11 w-full text-[var(--muted)]" onClick={() => disconnect()}>
            <Icon name="logout" className="h-4 w-4" />
            {t("disconnect")}
          </Button>
          <p className="mono mt-3 text-center text-[10px] text-[var(--muted)]">
            {clientConfig.appName} · {owner ? shortAddr(owner) : ""}
          </p>
        </div>
      )}

      <LicensesSheet open={licenses} onClose={() => setLicenses(false)} />
    </div>
  );
}
