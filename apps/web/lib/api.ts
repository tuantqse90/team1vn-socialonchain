import { clientConfig } from "@/configs";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super(String(body.error ?? `HTTP ${status}`));
  }
}

let token: string | null = null;
export function setApiToken(t: string | null) {
  token = t;
}
export function getApiToken() {
  return token;
}

export const API_URL = clientConfig.indexerUrl.replace(/\/$/, "");

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (init.json !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

/** Ghi event đo lường (ẩn danh, server băm địa chỉ). Lỗi thì bỏ qua. */
export function track(name: string, props: Record<string, unknown> = {}) {
  void api("/events", { method: "POST", json: { name, props } }).catch(() => undefined);
}

export function qs(params: Record<string, string | number | null | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}
