"use client";

import { useEffect, useRef } from "react";
import { clientConfig } from "@/configs";
import { ApiError, api } from "@/lib/api";
import { useUpdateSettings } from "@/lib/feeds";
import { useSession } from "@/lib/session";
import type { SavedFeed } from "@/lib/types";
import { type Pending, readPending, writePending } from "./picks";

/** Lỗi không thể thành công khi thử lại (4xx, vd. hết quota feed): bỏ luôn. */
const permanent = (e: unknown) => e instanceof ApiError && e.status >= 400 && e.status < 500;

/**
 * Khi đã có JWT (session key): lưu tên hiển thị + feed dựng từ lựa chọn onboarding, đặt feed đó làm tab đầu,
 * rồi xoá bản tạm. Chạy nền ở mọi trang (người dùng có thể rời /welcome trước khi JWT về). Lỗi không chặn gì cả.
 */
export function OnboardingFlush() {
  const { token, owner, me } = useSession();
  const update = useUpdateSettings();
  const updateRef = useRef(update);
  updateRef.current = update;
  const started = useRef<string | null>(null);

  useEffect(() => {
    if (!token || !owner || !me) return;
    const who = owner.toLowerCase();
    if (started.current === who) return;
    const p = readPending();
    if (!p || (!p.spec && !p.name)) return;
    if (p.owner && p.owner !== who) return;
    started.current = who;
    void (async () => {
      const rest: Pending = { ...p };
      if (p.name) {
        try {
          await api("/me/profile", { method: "PUT", json: { displayName: p.name } });
          rest.name = undefined;
        } catch (e) {
          if (permanent(e)) rest.name = undefined;
        }
      }
      if (p.spec) {
        try {
          const r = await api<SavedFeed>("/feeds", {
            method: "POST",
            json: { name: p.spec.name, spec: p.spec, isPublic: false },
          });
          // Đã lưu feed: không gửi lại lần nữa dù bước đặt tab có lỗi.
          rest.spec = undefined;
          const saved = me.settings?.feeds;
          const current = saved && saved.length > 0 ? saved : clientConfig.defaultFeeds;
          await updateRef.current({ feeds: [r.id, ...current.filter((x) => x !== r.id)].slice(0, 20) });
          try {
            localStorage.setItem("soc:tab", r.id);
          } catch {
            // bỏ qua
          }
        } catch (e) {
          if (permanent(e)) rest.spec = undefined;
        }
      }
      writePending(rest.spec || rest.name ? rest : null);
    })();
  }, [token, owner, me]);

  return null;
}
