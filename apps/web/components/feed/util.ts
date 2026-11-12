"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback } from "react";
import type { Author, Me, Post } from "@/lib/types";

/** id REST `oc:0x…` → bytes32 dùng trong contract. */
export function rawId(id: string): `0x${string}` {
  return id.slice(3) as `0x${string}`;
}

/** Link bài Farcaster: farcaster.xyz/<username>/<0x + 8 hex đầu của hash>, không có username thì về profile theo fid. */
export function fcUrl(post: Post): string | null {
  if (post.source !== "farcaster") return null;
  if (post.author.fcUsername)
    return `https://farcaster.xyz/${post.author.fcUsername}/${post.id.slice(3, 13)}`;
  if (post.author.fid) return `https://farcaster.xyz/~/profiles/${post.author.fid}`;
  return null;
}

/** Tên ngắn để gọi (không @): handle, rồi username Farcaster, rồi tên hiển thị. */
export function shortHandle(a: Author): string {
  return a.handle ?? a.fcUsername ?? a.displayName ?? (a.address ? `${a.address.slice(0, 6)}…` : "?");
}

/** Author giả cho chính mình (avatar ở composer, reply bar). */
export function meAuthor(owner: string | undefined, me: Me | undefined): Author {
  return {
    address: owner?.toLowerCase() ?? null,
    handle: null,
    displayName: me?.profile?.displayName ?? null,
    avatarUrl: me?.profile?.avatarUrl ?? null,
    registered: true,
    fid: null,
    fcUsername: null,
    contractsDeployed: 0,
  };
}

/** Tuổi bài theo ngôn ngữ: "3h" / "3 giờ". */
export function useAgo() {
  const t = useTranslations("card");
  const locale = useLocale();
  return useCallback(
    (unix: number) => {
      const s = Math.max(0, Math.floor(Date.now() / 1000 - unix));
      if (s < 60) return t("ageNow");
      if (s < 3600) return t("ageM", { n: Math.floor(s / 60) });
      if (s < 86400) return t("ageH", { n: Math.floor(s / 3600) });
      if (s < 86400 * 30) return t("ageD", { n: Math.floor(s / 86400) });
      return new Date(unix * 1000).toLocaleDateString(locale);
    },
    [t, locale],
  );
}
