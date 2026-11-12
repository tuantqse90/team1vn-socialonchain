import { ChatView } from "./chat";

type Props = { params: Promise<{ peer: string }> };

export const metadata = { robots: { index: false } };

export default async function Page({ params }: Props) {
  const { peer } = await params;
  return <ChatView id={decodeURIComponent(peer)} />;
}
