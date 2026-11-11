"use client";

import Link from "next/link";
import { shortAddr } from "@/lib/format";
import type { Author } from "@/lib/types";
import { Avatar } from "./bits";
import { Icon } from "./Icon";

export function PersonRow({ author, onClick }: { author: Author; onClick?: () => void }) {
  const href = author.handle ? `/u/${author.handle}` : author.address ? `/u/${author.address}` : null;
  const inner = (
    <span className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-[var(--soft)]">
      <Avatar author={author} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">
          {author.displayName || author.handle || author.fcUsername || shortAddr(author.address)}
        </span>
        <span className="block truncate text-sm text-[var(--muted)]">
          {author.handle
            ? `@${author.handle}`
            : author.fcUsername
              ? `@${author.fcUsername}`
              : shortAddr(author.address)}
        </span>
      </span>
      {author.fid && !author.registered && <Icon name="arch" className="h-4 w-4 text-[#8a63d2]" />}
    </span>
  );
  return href ? (
    <Link href={href} onClick={onClick}>
      {inner}
    </Link>
  ) : (
    inner
  );
}
