import "server-only";
import { API_URL } from "./api";

/** Gọi API từ server (SSR metadata). API_INTERNAL_URL dùng khi web và indexer chung mạng nội bộ. */
export async function serverApi<T>(path: string): Promise<T | null> {
  const base = (process.env.API_INTERNAL_URL || API_URL).replace(/\/$/, "");
  try {
    const r = await fetch(`${base}${path}`, { next: { revalidate: 30 }, signal: AbortSignal.timeout(3000) });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}
