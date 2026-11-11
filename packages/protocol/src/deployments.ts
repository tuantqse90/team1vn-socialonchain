import type { Address } from "viem";
import local from "../deployments/31337.json" with { type: "json" };
import fuji from "../deployments/43113.json" with { type: "json" };

export type Deployment = {
  chainId: number;
  version: string;
  startBlock: number;
  deployed: boolean;
  IdentityRegistry: Address;
  SocialGraph: Address;
  Posts: Address;
  TestUSD: Address;
  PlanPayments: Address;
  treasury: Address;
};

function normalize(raw: Record<string, unknown>): Deployment {
  return { deployed: true, ...raw } as Deployment;
}

const all: Record<number, Deployment> = {
  31337: normalize(local),
  43113: normalize(fuji),
};

/** Địa chỉ contract theo chainId. Ném lỗi nếu chain chưa được deploy. */
export function getDeployment(chainId: number): Deployment {
  const d = all[chainId];
  if (!d?.deployed) {
    throw new Error(`Chưa có deployment cho chainId ${chainId}. Chạy contracts/script/Deploy.s.sol trước.`);
  }
  return d;
}

export function hasDeployment(chainId: number): boolean {
  return Boolean(all[chainId]?.deployed);
}
