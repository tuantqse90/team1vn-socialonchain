"use client";

import { linkWalletMessage } from "@socialonchain/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useState } from "react";
import { type Address, isAddress } from "viem";
import { ApiError, api } from "@/lib/api";
import { addressUrl, chain } from "@/lib/chain";
import { shortAddr } from "@/lib/format";
import type { User } from "@/lib/types";
import { Button, Sheet } from "../bits";
import { Icon } from "../Icon";

type Linked = { address: string; createdAt: number };
type LinkError = "bad_signature" | "same_as_owner" | "too_many" | "bad_address";

/**
 * Ví builder: ví nhúng là địa chỉ mới nên chưa deploy gì. Builder liên kết ví deployer (ký bằng chính ví đó,
 * ở Core/MetaMask/cast…) để số contract của ví được cộng vào badge `onchain_builder`.
 * Ký ở ngoài app (không popup trong app): chép tin nhắn → ký → dán địa chỉ + chữ ký.
 */
export function BuilderWalletsSheet({
  open,
  onClose,
  owner,
}: {
  open: boolean;
  onClose: () => void;
  owner: Address;
}) {
  const t = useTranslations("account");
  const qc = useQueryClient();
  const [address, setAddress] = useState("");
  const [signature, setSignature] = useState("");
  const [error, setError] = useState<LinkError | "failed" | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) return;
    setAddress("");
    setSignature("");
    setError(null);
  }, [open]);

  const list = useQuery({
    queryKey: ["me-wallets", owner],
    queryFn: () => api<{ items: Linked[] }>("/me/wallets"),
    enabled: open,
  });

  /** Số contract (đã cộng ví liên kết) do worker quét; null khi chưa quét. */
  const user = useQuery({
    queryKey: ["user", owner, "builder"],
    queryFn: () => api<User>(`/users/${owner}`),
    enabled: open,
  });
  const contracts = user.data?.builder?.contractsDeployed ?? null;

  const wallet = address.trim();
  const validAddr = isAddress(wallet, { strict: false });
  const message = validAddr
    ? linkWalletMessage({ owner, wallet: wallet as Address, chainId: chain.id })
    : null;
  const sig = signature.trim();
  const validSig = /^0x[0-9a-fA-F]{130,}$/.test(sig);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["me-wallets", owner] });
    void qc.invalidateQueries({ queryKey: ["me"] });
    void qc.invalidateQueries({ queryKey: ["user"] });
  };

  const link = useMutation({
    mutationFn: () =>
      api<{ address: string }>("/me/wallets", { method: "POST", json: { address: wallet, signature: sig } }),
    onSuccess: () => {
      setAddress("");
      setSignature("");
      refresh();
    },
    onError: (e) => {
      const code = e instanceof ApiError ? String(e.body.error ?? "") : "";
      setError(
        code === "bad_signature" || code === "same_as_owner" || code === "too_many"
          ? code
          : code === "bad_request"
            ? "bad_address"
            : "failed",
      );
    },
  });

  const unlink = useMutation({
    mutationFn: (a: string) => api(`/me/wallets/${a}`, { method: "DELETE" }),
    onSuccess: refresh,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!validAddr) return setError("bad_address");
    if (wallet.toLowerCase() === owner.toLowerCase()) return setError("same_as_owner");
    if (!validSig || link.isPending) return;
    setError(null);
    link.mutate();
  }

  async function copy() {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard bị chặn: người dùng tự chọn chữ
    }
  }

  const items = list.data?.items ?? [];

  return (
    <Sheet open={open} onClose={onClose} title={t("builderWallets")}>
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--soft)]">
          <Icon name="cube" className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          {contracts !== null && (
            <p className="text-[17px] font-extrabold" data-testid="builder-contracts">
              {t("contractsCount", { n: contracts })}
            </p>
          )}
          <p className="text-[13px] text-[var(--muted)]">{t("builderWalletsHint")}</p>
        </div>
      </div>

      <ul
        className="mb-5 divide-y divide-[var(--line)] border-y border-[var(--line)]"
        data-testid="linked-wallets"
      >
        {items.length === 0 && (
          <li className="py-3 text-[14px] text-[var(--muted)]">{list.isLoading ? "…" : t("noLinked")}</li>
        )}
        {items.map((w) => (
          <li key={w.address} className="flex items-center gap-2 py-2.5" data-testid="linked-wallet">
            <Icon name="wallet" className="h-4 w-4 shrink-0 text-[var(--muted)]" />
            <a
              href={addressUrl(w.address) ?? undefined}
              target="_blank"
              rel="noreferrer"
              className="mono min-w-0 flex-1 truncate text-[14px] font-semibold"
              data-testid="linked-wallet-address"
            >
              {shortAddr(w.address)}
            </a>
            <Button
              variant="ghost"
              className="h-9 px-3 text-[13px] text-[var(--muted)]"
              onClick={() => unlink.mutate(w.address)}
              disabled={unlink.isPending}
            >
              {t("unlink")}
            </Button>
          </li>
        ))}
      </ul>

      <form onSubmit={submit} className="space-y-3">
        <label className="block text-[13px] font-semibold" htmlFor="link-address">
          {t("linkAddress")}
        </label>
        <input
          id="link-address"
          className="field mono"
          placeholder="0x…"
          autoComplete="off"
          spellCheck={false}
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
            setError(null);
          }}
          data-testid="link-address"
        />
        {message && (
          <div>
            <p className="mb-1.5 text-[13px] font-semibold">{t("linkMessageLabel")}</p>
            <div className="relative">
              <pre
                className="mono select-all whitespace-pre-wrap break-all rounded-[14px] bg-[var(--soft)] p-3 pr-12 text-[12px] leading-relaxed"
                data-testid="link-message"
              >
                {message}
              </pre>
              <button
                type="button"
                onClick={() => void copy()}
                aria-label={t("copied")}
                className="press absolute top-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-[var(--bg)]"
              >
                <Icon name={copied ? "check" : "copy"} className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        <label className="block text-[13px] font-semibold" htmlFor="link-signature">
          {t("linkSignature")}
        </label>
        <textarea
          id="link-signature"
          className="field mono h-20 resize-none py-2 text-[12px]"
          placeholder="0x…"
          spellCheck={false}
          value={signature}
          onChange={(e) => {
            setSignature(e.target.value);
            setError(null);
          }}
          data-testid="link-signature"
        />
        {error && (
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--err-ink)]">
            <Icon name="alert" className="h-4 w-4 shrink-0" />
            {error === "failed" ? t("errors.failed") : t(`linkErrors.${error}`)}
          </p>
        )}
        <Button
          variant="solid"
          className="h-11 w-full"
          type="submit"
          disabled={!validAddr || !validSig || link.isPending}
          testId="link-submit"
        >
          {link.isPending ? (
            <span className="spinner" aria-hidden />
          ) : (
            <Icon name="plus" className="h-4 w-4" />
          )}
          {t("linkSubmit")}
        </Button>
      </form>
    </Sheet>
  );
}
