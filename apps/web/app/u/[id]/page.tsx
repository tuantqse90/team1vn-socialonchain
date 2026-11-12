import type { Metadata } from "next";
import { serverApi } from "@/lib/server";
import type { User } from "@/lib/types";
import { ProfileView } from "./view";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const u = await serverApi<User>(`/users/${encodeURIComponent(id)}`);
  if (!u) return { title: id };
  const name = u.profile.displayName || (u.handle ? `@${u.handle}` : u.address);
  const builder =
    u.builder && u.builder.contractsDeployed > 0 ? ` · ${u.builder.contractsDeployed} contracts` : "";
  const desc = u.profile.bio ?? `${u.counts.posts} posts · ${u.counts.followers} followers${builder}`;
  return {
    title: name,
    description: desc,
    openGraph: { type: "profile", title: name, description: desc, username: u.handle ?? undefined },
    twitter: { card: "summary", title: name, description: desc },
  };
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <ProfileView id={decodeURIComponent(id)} />;
}
