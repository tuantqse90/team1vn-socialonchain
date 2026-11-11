"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Empty } from "@/components/bits";
import { Icon } from "@/components/Icon";
import { PersonRow } from "@/components/PersonRow";
import { PostCard } from "@/components/PostCard";
import { api, qs } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { Author, Post } from "@/lib/types";

export function SearchView() {
  const t = useTranslations("search");
  const params = useSearchParams();
  const router = useRouter();
  const { owner } = useSession();
  const [text, setText] = useState(params.get("q") ?? "");
  const [q, setQ] = useState(text);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  useEffect(() => {
    const id = setTimeout(() => {
      setQ(text.trim());
      router.replace(`/search${qs({ q: text.trim() })}`, { scroll: false });
    }, 300);
    return () => clearTimeout(id);
  }, [text, router]);

  const r = useQuery({
    queryKey: ["search", q, owner],
    queryFn: () =>
      api<{ users: Author[]; posts: Post[] }>(`/search${qs({ q, viewer: owner?.toLowerCase() })}`),
    enabled: q.length >= 2,
  });

  return (
    <div>
      <div className="px-4 py-3">
        <div className="relative">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]"
          />
          <input
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 100))}
            placeholder={t("placeholder")}
            className="field pl-10"
            ref={inputRef}
            data-testid="search-input"
          />
        </div>
      </div>
      {r.isFetching && <div className="skeleton mx-4 h-12 rounded-2xl" />}
      {r.data && r.data.users.length > 0 && (
        <section className="px-2 pb-2">
          <h2 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            {t("people")}
          </h2>
          {r.data.users.map((u) => (
            <PersonRow key={u.address ?? `fid:${u.fid}`} author={u} />
          ))}
        </section>
      )}
      {r.data && r.data.posts.length > 0 && (
        <section className="border-t border-[var(--line)]">
          <h2 className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            {t("posts")}
          </h2>
          {r.data.posts.map((p) => (
            <div key={p.id} className="border-b border-[var(--line)]">
              <PostCard post={p} />
            </div>
          ))}
        </section>
      )}
      {r.data && r.data.users.length === 0 && r.data.posts.length === 0 && <Empty icon="search" text="—" />}
    </div>
  );
}
