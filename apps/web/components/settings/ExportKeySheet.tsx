"use client";

import { PASSWORD_MIN } from "@socialonchain/protocol";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useState } from "react";
import type { Hex } from "viem";
import { ApiError } from "@/lib/api";
import { exportKey } from "@/lib/embedded";
import { Button, Sheet } from "../bits";
import { Icon } from "../Icon";

/**
 * Xuất private key của ví nhúng: hỏi lại mật khẩu (server kiểm authKey, máy tự giải mã).
 * Khoá chỉ hiện trong sheet này, đóng sheet là xoá khỏi state. Không log, không gửi đi đâu.
 */
export function ExportKeySheet({
  open,
  onClose,
  handle,
}: {
  open: boolean;
  onClose: () => void;
  handle: string;
}) {
  const t = useTranslations("account");
  const [password, setPassword] = useState("");
  const [key, setKey] = useState<Hex | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) return;
    setPassword("");
    setKey(null);
    setError(null);
    setCopied(false);
  }, [open]);

  async function reveal(e: FormEvent) {
    e.preventDefault();
    if (busy || password.length < PASSWORD_MIN) return;
    setBusy(true);
    setError(null);
    try {
      setKey(await exportKey(handle, password));
      setPassword("");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? t("errors.rate_limited")
          : err instanceof ApiError && err.status >= 500
            ? t("errors.failed")
            : t("errors.bad_credentials"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard bị chặn: người dùng tự chọn chữ
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("exportKey")}>
      <p className="mb-4 flex items-start gap-2 text-[14px] font-semibold text-[var(--err-ink)]">
        <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
        {t("exportHint")}
      </p>
      {key ? (
        <div className="space-y-3">
          <code
            className="mono block select-all break-all rounded-[16px] bg-[var(--soft)] p-4 text-[13px] leading-relaxed"
            data-testid="export-key-value"
          >
            {key}
          </code>
          <Button variant="solid" className="h-11 w-full" onClick={() => void copy()}>
            <Icon name={copied ? "check" : "copy"} className="h-4 w-4" />
            {copied ? t("copied") : t("copyKey")}
          </Button>
        </div>
      ) : (
        <form onSubmit={(e) => void reveal(e)} className="space-y-3">
          <input type="text" name="username" autoComplete="username" value={handle} readOnly hidden />
          <input
            className="field"
            type="password"
            autoComplete="current-password"
            placeholder={t("password")}
            aria-label={t("password")}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            data-testid="export-key-password"
          />
          {error && <p className="text-[13px] font-semibold text-[var(--err-ink)]">{error}</p>}
          <Button
            variant="solid"
            className="h-11 w-full"
            type="submit"
            disabled={busy || password.length < PASSWORD_MIN}
            testId="export-key-reveal"
          >
            {busy ? <span className="spinner" aria-hidden /> : <Icon name="key" className="h-4 w-4" />}
            {t("reveal")}
          </Button>
        </form>
      )}
    </Sheet>
  );
}
