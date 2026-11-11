import { type Address, type Hex, keccak256, type LocalAccount, toBytes, verifyMessage } from "viem";

/** Một nhãn: subject là ID bài ("oc:..", "fc:..") hoặc "author:<id>". */
export type LabelItem = { subject: string; label: string; score: number };

export type LabelBatch = {
  v: 1;
  labeler: Address;
  issuedAt: number;
  items: LabelItem[];
};

/** JSON ổn định (key sắp xếp, điểm làm tròn 3 chữ số) để chữ ký không phụ thuộc thứ tự field. */
export function canonicalBatch(batch: LabelBatch): string {
  const items = [...batch.items]
    .map((i) => ({ label: i.label, score: Math.round(i.score * 1000) / 1000, subject: i.subject }))
    .sort((a, b) => (a.subject + a.label).localeCompare(b.subject + b.label));
  return JSON.stringify({
    issuedAt: batch.issuedAt,
    items,
    labeler: batch.labeler.toLowerCase(),
    v: batch.v,
  });
}

export function batchDigest(batch: LabelBatch): Hex {
  return keccak256(toBytes(canonicalBatch(batch)));
}

export async function signLabelBatch(account: LocalAccount, batch: LabelBatch): Promise<Hex> {
  return account.signMessage({ message: { raw: batchDigest(batch) } });
}

export async function verifyLabelBatch(batch: LabelBatch, signature: Hex): Promise<boolean> {
  return verifyMessage({ address: batch.labeler, message: { raw: batchDigest(batch) }, signature });
}
