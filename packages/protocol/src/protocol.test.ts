import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { channelHash, onchainPostId, parsePostId } from "./ids";
import { type LabelBatch, signLabelBatch, verifyLabelBatch } from "./labels";
import { sessionAuthMessage, verifySessionAuth } from "./session";

const key = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const owner = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");

describe("ids", () => {
  it("parse/format post ids", () => {
    const id = onchainPostId("0xABCDEF");
    expect(id).toBe("oc:0xabcdef");
    expect(parsePostId(id)).toEqual({ source: "onchain", raw: "0xabcdef" });
    expect(parsePostId("fc:0x12")?.source).toBe("farcaster");
    expect(parsePostId("x:1")).toBeNull();
  });
  it("channel hash không phân biệt hoa thường", () => {
    expect(channelHash("Avalanche")).toBe(channelHash("avalanche "));
  });
});

describe("session auth", () => {
  it("ký và verify đúng; từ chối khi hết hạn hoặc sai key", async () => {
    const payload = { owner: owner.address, key: key.address, chainId: 31337, issuedAt: 1_000 };
    const sig = await key.signMessage({ message: sessionAuthMessage(payload) });
    expect(await verifySessionAuth(payload, sig, 1_100)).toEqual({ ok: true });
    expect(await verifySessionAuth(payload, sig, 5_000)).toEqual({ ok: false, reason: "expired" });
    const wrong = await owner.signMessage({ message: sessionAuthMessage(payload) });
    expect(await verifySessionAuth(payload, wrong, 1_100)).toEqual({ ok: false, reason: "bad_signature" });
  });
});

describe("label batch", () => {
  it("chữ ký không phụ thuộc thứ tự item; sửa điểm thì chữ ký hỏng", async () => {
    const batch: LabelBatch = {
      v: 1,
      labeler: key.address,
      issuedAt: 1,
      items: [
        { subject: "oc:0x1", label: "topic:avalanche", score: 0.9 },
        { subject: "oc:0x2", label: "quality:shill", score: 0.1 },
      ],
    };
    const sig = await signLabelBatch(key, batch);
    expect(await verifyLabelBatch({ ...batch, items: [...batch.items].reverse() }, sig)).toBe(true);
    const tampered = { ...batch, items: [{ ...batch.items[0]!, score: 0.1 }, batch.items[1]!] };
    expect(await verifyLabelBatch(tampered, sig)).toBe(false);
  });
});

import { channelHash as ch2, channelNameFromHash, parseHashtags, parseMentions } from "./index";

describe("text helpers", () => {
  it("parses mentions and hashtags", () => {
    const t =
      "gm @alice_dev and @0xAbCdEf0123456789abcdef0123456789ABCDEF01 #Avalanche #xây_dựng email a@b.com";
    expect(parseMentions(t)).toEqual({
      handles: ["alice_dev"],
      addresses: ["0xabcdef0123456789abcdef0123456789abcdef01"],
    });
    expect(parseHashtags(t)).toEqual(["avalanche", "xây_dựng"]);
  });
  it("maps known channel hashes back to names", () => {
    expect(channelNameFromHash(ch2("avalanche"))).toBe("avalanche");
    expect(channelNameFromHash("0x00")).toBeNull();
  });
});
