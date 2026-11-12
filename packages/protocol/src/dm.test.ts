import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  dmBindMessage,
  dmDecrypt,
  dmDeriveMessage,
  dmEncrypt,
  dmKeyFromSignature,
  dmPair,
  dmSharedKey,
  fromB64,
  isDmPublicKey,
  parseDmPayload,
  toB64,
  verifyDmKeyBinding,
} from "./dm";

const alice = privateKeyToAccount(generatePrivateKey());
const bob = privateKeyToAccount(generatePrivateKey());
const mallory = privateKeyToAccount(generatePrivateKey());

async function keysOf(acc: typeof alice) {
  const sig = await acc.signMessage({ message: dmDeriveMessage(acc.address) });
  return dmKeyFromSignature(sig);
}

describe("dm crypto", () => {
  it("derives the same key from the same wallet (deterministic signature)", async () => {
    const a1 = await keysOf(alice);
    const a2 = await keysOf(alice);
    expect(a1).toEqual(a2);
    expect(isDmPublicKey(a1.publicKey)).toBe(true);
    expect((await keysOf(bob)).publicKey).not.toBe(a1.publicKey);
  });

  it("binding signature verifies only for the owner and that exact key", async () => {
    const a = await keysOf(alice);
    const b = await keysOf(bob);
    const sig = await alice.signMessage({ message: dmBindMessage(alice.address, a.publicKey) });
    expect(await verifyDmKeyBinding(alice.address, a.publicKey, sig)).toBe(true);
    expect(await verifyDmKeyBinding(alice.address, b.publicKey, sig)).toBe(false);
    expect(await verifyDmKeyBinding(bob.address, a.publicKey, sig)).toBe(false);
  });

  it("both sides get the same shared key; round trip; direction and tampering are caught", async () => {
    const a = await keysOf(alice);
    const b = await keysOf(bob);
    const m = await keysOf(mallory);
    const ka = await dmSharedKey(a.privateKey, b.publicKey, alice.address, bob.address);
    const kb = await dmSharedKey(b.privateKey, a.publicKey, bob.address, alice.address);
    const payload = { v: 1, t: "text", text: "xin chào 🔥 gm" } as const;
    const env = await dmEncrypt(ka, payload, alice.address, bob.address);
    expect(env.ciphertext).not.toContain("chào");
    expect(await dmDecrypt(kb, env, alice.address, bob.address)).toEqual(payload);
    // Người gửi đọc lại tin của chính mình
    expect(await dmDecrypt(ka, env, alice.address, bob.address)).toEqual(payload);
    // Server đảo chiều (giả làm tin của Bob) → hỏng
    expect(await dmDecrypt(kb, env, bob.address, alice.address)).toBeNull();
    // Người thứ ba không đọc được
    const km = await dmSharedKey(m.privateKey, a.publicKey, mallory.address, alice.address);
    expect(await dmDecrypt(km, env, alice.address, bob.address)).toBeNull();
    // Sửa 1 byte ciphertext → hỏng
    const ct = fromB64(env.ciphertext);
    ct[0] = (ct[0] ?? 0) ^ 1;
    expect(await dmDecrypt(kb, { ...env, ciphertext: toB64(ct) }, alice.address, bob.address)).toBeNull();
  });

  it("nonce is random per message", async () => {
    const a = await keysOf(alice);
    const b = await keysOf(bob);
    const k = await dmSharedKey(a.privateKey, b.publicKey, alice.address, bob.address);
    const p = { v: 1, t: "text", text: "same" } as const;
    const e1 = await dmEncrypt(k, p, alice.address, bob.address);
    const e2 = await dmEncrypt(k, p, alice.address, bob.address);
    expect(e1.nonce).not.toBe(e2.nonce);
    expect(e1.ciphertext).not.toBe(e2.ciphertext);
  });

  it("payload validation", () => {
    expect(parseDmPayload({ v: 1, t: "react", to: 3, emoji: "❤️" })).toEqual({
      v: 1,
      t: "react",
      to: 3,
      emoji: "❤️",
    });
    expect(parseDmPayload({ v: 1, t: "text", text: "" })).toBeNull();
    expect(parseDmPayload({ v: 1, t: "text", text: "x".repeat(2001) })).toBeNull();
    expect(parseDmPayload({ v: 2, t: "text", text: "hi" })).toBeNull();
    expect(parseDmPayload({ v: 1, t: "react", to: -1, emoji: "x" })).toBeNull();
    expect(dmPair("0xB", "0xa")).toBe("0xa:0xb");
  });
});
