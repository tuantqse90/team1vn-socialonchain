"use client";

import { socialGraphAbi } from "@socialonchain/protocol";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { contracts } from "@/lib/chain";
import { useSession } from "@/lib/session";
import { useSessionWrite } from "@/lib/tx";
import { Icon } from "./Icon";

/**
 * Follow/unfollow bằng session key (không popup ví), lạc quan: đổi ngay, tx chạy nền, lỗi thì trả lại.
 * Chưa có session key thì chuyển sang /welcome.
 */
export function useFollow(target: string | null | undefined, initial: boolean) {
  const t = useTranslations("follow");
  const router = useRouter();
  const { status, owner } = useSession();
  const write = useSessionWrite();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const following = optimistic ?? initial;
  const isMe = Boolean(owner && target && owner.toLowerCase() === target.toLowerCase());

  async function toggle() {
    if (!target) return;
    if (status !== "ready" || !contracts || !owner) {
      router.push("/welcome");
      return;
    }
    const next = !following;
    setOptimistic(next);
    const ok = await write(next ? t("follow") : t("unfollow"), {
      address: contracts.SocialGraph,
      abi: socialGraphAbi,
      functionName: next ? "follow" : "unfollow",
      args: [owner, target as `0x${string}`],
    });
    if (!ok) setOptimistic(!next);
  }
  return { following, toggle, isMe, changed: optimistic !== null && optimistic !== initial };
}

/** Pill follow. `back`: hiện "Follow lại" khi người kia đã follow mình. */
export function FollowButton({
  address,
  following: initial,
  back = false,
  size = "sm",
  testId = "follow",
}: {
  address: string | null | undefined;
  following: boolean;
  back?: boolean;
  size?: "sm" | "md";
  testId?: string;
}) {
  const t = useTranslations("follow");
  const f = useFollow(address, initial);
  if (!address || f.isMe) return null;
  const h = size === "md" ? "h-10 px-5 text-[15px]" : "h-8 px-3.5 text-[13px]";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void f.toggle();
      }}
      data-testid={testId}
      aria-pressed={f.following}
      className={`press relative inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold transition-colors before:absolute before:-inset-y-[6px] before:inset-x-0 before:content-[''] ${h} ${
        f.following
          ? "border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)]"
          : "bg-[var(--ink)] text-[var(--bg)]"
      }`}
    >
      {f.following && <Icon name="check" className={`h-4 w-4 ${f.changed ? "anim-pop" : ""}`} />}
      {f.following ? t("following") : back ? t("followBack") : t("follow")}
    </button>
  );
}
