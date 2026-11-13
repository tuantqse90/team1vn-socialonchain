import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  accountMessage,
  authKeyHash,
  createAccountSecrets,
  decryptKeystore,
  deriveAccountKeys,
  linkWalletMessage,
} from "./account";

// N nhỏ cho test nhanh; app dùng DEFAULT_SCRYPT.
const FAST = { N: 2 ** 10, r: 8, p: 1 };

describe("account keystore", () => {
  it("round-trips the private key with the right password; authKey is stable and differs from encKey", async () => {
    const pk = generatePrivateKey();
    const { address } = privateKeyToAccount(pk);
    const s = await createAccountSecrets("correct horse", pk, address, FAST);
    expect(s.keystore.ct).not.toContain(pk.slice(2));
    const again = await deriveAccountKeys("correct horse", s.kdf);
    expect(again.authKey).toBe(s.authKey);
    expect(decryptKeystore(again.encKey, s.keystore, address)).toBe(pk);
    expect(authKeyHash(s.authKey)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(authKeyHash(s.authKey)).not.toBe(s.authKey);
  });

  it("wrong password, other address or tampered ciphertext fail to decrypt", async () => {
    const pk = generatePrivateKey();
    const { address } = privateKeyToAccount(pk);
    const s = await createAccountSecrets("pw-one-1234", pk, address, FAST);
    const wrong = await deriveAccountKeys("pw-two-1234", s.kdf);
    expect(wrong.authKey).not.toBe(s.authKey);
    expect(() => decryptKeystore(wrong.encKey, s.keystore, address)).toThrow();
    const right = await deriveAccountKeys("pw-one-1234", s.kdf);
    const other = privateKeyToAccount(generatePrivateKey()).address;
    expect(() => decryptKeystore(right.encKey, s.keystore, other)).toThrow();
    const flipped = { ...s.keystore, ct: `${s.keystore.ct.slice(0, -2)}00` as `0x${string}` };
    expect(() => decryptKeystore(right.encKey, flipped, address)).toThrow();
  });

  it("NFKC: the same password typed with composed or decomposed accents derives the same keys", async () => {
    const pk = generatePrivateKey();
    const { address } = privateKeyToAccount(pk);
    const s = await createAccountSecrets("mật khẩu", pk, address, FAST);
    const decomposed = "mật khẩu".normalize("NFD");
    expect((await deriveAccountKeys(decomposed, s.kdf)).authKey).toBe(s.authKey);
  });

  it("accountMessage binds handle, checksummed address and chain", () => {
    const m = accountMessage({
      handle: "linh",
      address: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
      chainId: 43113,
    });
    expect(m).toContain("handle: linh");
    expect(m).toContain("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC");
    expect(m).toContain("chain: 43113");
  });

  it("linkWalletMessage binds checksummed owner, wallet and chain in a fixed format", () => {
    const m = linkWalletMessage({
      owner: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
      wallet: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
      chainId: 43113,
    });
    expect(m).toBe(
      "socialonchain link wallet v1\n" +
        "account: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC\n" +
        "wallet: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8\n" +
        "chain: 43113",
    );
    // Đảo owner/wallet hoặc đổi chain → tin nhắn khác (chữ ký không dùng lại được).
    const swapped = linkWalletMessage({
      owner: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
      wallet: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
      chainId: 43113,
    });
    expect(swapped).not.toBe(m);
    const otherChain = linkWalletMessage({
      owner: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
      wallet: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
      chainId: 43114,
    });
    expect(otherChain).not.toBe(m);
  });
});
