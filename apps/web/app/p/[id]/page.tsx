import type { Metadata } from "next";
import { displayName } from "@/lib/format";
import { serverApi } from "@/lib/server";
import type { Post } from "@/lib/types";
import { ThreadView } from "./view";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const p = await serverApi<Post>(`/posts/${encodeURIComponent(decodeURIComponent(id))}`);
  if (!p || p.deleted) return { title: "Post" };
  const title = displayName(p.author);
  const description = p.text.slice(0, 200);
  return {
    title,
    description,
    openGraph: { title, description, type: "article" },
    twitter: { card: "summary" },
  };
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <ThreadView id={decodeURIComponent(id)} />;
}
