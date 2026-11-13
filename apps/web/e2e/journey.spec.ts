import { test as base, expect, type Page } from "@playwright/test";
import {
  dmDecrypt,
  dmDeriveMessage,
  dmEncrypt,
  dmKeyFromSignature,
  dmSharedKey,
  linkWalletMessage,
  sessionAuthMessage,
} from "@socialonchain/protocol";
import {
  type Address,
  createWalletClient,
  encodeFunctionData,
  type Hex,
  http,
  keccak256,
  parseAbi,
  parseEther,
  toBytes,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";

/**
 * Hành trình cốt lõi, chạy trên chain + indexer thật ở local:
 * ví nhúng (tự mở khoá bằng Anvil #2) → đăng ký (1 tx, kèm session key) → đăng bài không popup → why → follow
 * → feed builder bằng lời + preview rank() trong trình duyệt → lưu tab → báo cáo → admin → faucet tUSD + mua Pro bằng permit.
 * Chạy lại được nhiều lần: account đã đăng ký thì bỏ qua bước join.
 */
const ACCOUNT = "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc";
/** Session key + JWT nằm trong localStorage: lưu lại sau onboarding để các test sau dùng chung "thiết bị". */
const STATE = "e2e/.auth/state.json";
const RUN = Date.now().toString(36);
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:42069";
const RPC = process.env.ANVIL_RPC_URL ?? "http://127.0.0.1:8545";
/** Ví B: Anvil account #3 (unlocked), gửi tx trực tiếp qua RPC, không qua UI. */
const WALLET_B = "0x90f79bf6eb2c4f870365e785982e1f101e93b906";
/** Deployer = Anvil account #0, owner của TestUSD ở local. */
const DEPLOYER = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";

/** Mọi test: trình duyệt báo vi phạm CSP (script/fetch/ảnh bị chặn) thì fail. */
const test = base.extend<{ cspGuard: undefined }>({
  cspGuard: [
    async ({ page }, use) => {
      const violations: string[] = [];
      page.on("console", (m) => {
        if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
      });
      await use();
      expect(violations, "CSP violations").toEqual([]);
    },
    { auto: true },
  ],
});

async function rpc(method: string, params: unknown[]) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = (await r.json()) as { result?: unknown; error?: { message: string } };
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

async function waitTxOk(page: Page) {
  await expect(page.getByTestId("tx-ok").last()).toBeVisible({ timeout: 45_000 });
}

test.describe.configure({ mode: "serial" });

test("onboarding: đăng ký 1 tx kèm session key (hoặc bật thiết bị mới)", async ({ page }) => {
  test.setTimeout(180_000); // lần đầu next dev phải compile trang
  await page.goto("/welcome");
  const join = page.getByTestId("join-submit");
  const enable = page.getByTestId("enable-device");
  const done = page.getByTestId("welcome-done");
  await expect(join.or(enable).or(done)).toBeVisible({ timeout: 120_000 });
  if (await join.isVisible()) {
    const fund = page.getByTestId("dev-fund");
    if (await fund.isVisible()) await fund.click();
    await page.getByTestId("handle-input").fill(`e2e_${RUN}`.slice(0, 20));
    await page.getByTestId("name-input").fill("E2E Tester");
    await expect(join).toBeEnabled({ timeout: 15_000 });
    await join.click();
    await waitTxOk(page);
  }
  // Account đã đăng ký từ lần chạy trước = "thiết bị mới": ví nhúng tự gửi 1 tx addDelegate, không cần bấm.
  await expect(done).toBeVisible({ timeout: 60_000 });
  await page.context().storageState({ path: STATE });
});

test.describe("đã đăng nhập", () => {
  test.use({ storageState: STATE });

  test("đăng bài bằng session key, thấy trên profile", async ({ page }) => {
    await page.goto("/");
    const text = `e2e post ${RUN} #team1`;
    // Home có hàng "Có gì mới?": bấm vào mới mở composer (sheet).
    await page.getByTestId("whats-new").click();
    await page.getByTestId("composer-input").first().fill(text);
    await page.getByTestId("composer-submit").first().click();
    await waitTxOk(page);
    // Sheet hiện panel "đã đăng" (block, phí gas) ~1.6s rồi tự đóng.
    await expect(page.getByTestId("composer")).toBeHidden({ timeout: 20_000 });
    // Điều hướng trong SPA: TxProvider đợi indexer bắt kịp rồi làm mới query, nên bài hiện mà không cần reload.
    await page.getByTestId("nav-profile").filter({ visible: true }).click();
    await expect(page.getByText(text)).toBeVisible({ timeout: 30_000 });
  });

  test("ví B follow ví A thì thấy bài của A trong feed của B", async ({ request }) => {
    const net = (await (await request.get(`${API}/network`)).json()) as {
      contracts: { SocialGraph: string };
    };
    const data = encodeFunctionData({
      abi: parseAbi(["function follow(address actor, address target)"]),
      args: [WALLET_B, ACCOUNT],
    });
    await rpc("eth_sendTransaction", [{ from: WALLET_B, to: net.contracts.SocialGraph, data }]);
    await expect
      .poll(
        async () => {
          const f = (await (
            await request.get(`${API}/feed?feedId=default:chronological&viewer=${WALLET_B}&limit=50`)
          ).json()) as { items: { post: { author: { address: string | null } } }[] };
          return f.items.some((i) => i.post.author.address === ACCOUNT);
        },
        { timeout: 20_000 },
      )
      .toBe(true);
  });

  test("trang profile + bài công khai được SSR, có OG tags", async ({ request }) => {
    const res = await request.get(`/u/${ACCOUNT}`);
    // CSP có nonce theo từng request, script của trang mang đúng nonce đó.
    const csp = res.headers()["content-security-policy"] ?? "";
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
    const profile = await res.text();
    expect(profile).toContain(`nonce="${nonce}"`);
    expect(profile).toContain('property="og:title"');
    expect(profile).toContain("E2E Tester");
    const posts = (await (await request.get(`${API}/users/${ACCOUNT}/posts`)).json()) as {
      items: { id: string; text: string }[];
    };
    const p = posts.items[0];
    expect(p).toBeTruthy();
    const html = await (await request.get(`/p/${p?.id}`)).text();
    expect(html).toContain('property="og:description"');
    expect(html).toContain(p?.text.slice(0, 20) ?? "");
  });

  test("feed có bài + Why? giải thích theo rule", async ({ page }) => {
    await page.goto("/");
    const first = page.getByTestId("post").first();
    await expect(first).toBeVisible();
    await first.getByTestId("why").click();
    await expect(page.getByTestId("why-sheet")).toBeVisible();
  });

  test("follow một builder trong seed", async ({ page }) => {
    await page.goto("/search?q=a");
    await expect(page.getByTestId("search-input")).toBeVisible();
    await page.goto("/");
    // Mở profile tác giả onchain đầu tiên (không phải chính mình).
    const author = page
      .locator(`[data-testid="post"] header a[href^="/u/"]:not([href*="e2e_"]):not([href*="${ACCOUNT}"])`)
      .first();
    await expect(author).toBeVisible();
    await author.click();
    const follow = page.getByTestId("follow");
    await expect(follow).toBeVisible();
    const before = (await follow.textContent())?.trim();
    await follow.click();
    await waitTxOk(page);
    await expect(follow).not.toHaveText(before ?? "");
  });

  test("feed builder: lời nói → rule → preview rank() → lưu tab", async ({ page, request }) => {
    await page.goto("/feeds/new");
    // Chạy lại sau khi reset chain local: gói Pro (mua ở test cuối) mất, còn feed E2E cũ trong schema `app`
    // thì vượt quota Free. Dọn feed E2E của lần chạy trước.
    const token = await page.evaluate(
      (k) => (JSON.parse(localStorage.getItem(k) ?? "null") as { token?: string } | null)?.token ?? null,
      `soc:jwt:31337:${ACCOUNT}`,
    );
    const feeds = (await (await request.get(`${API}/feeds?viewer=${ACCOUNT}`)).json()) as {
      mine: { id: string; name: string }[];
    };
    for (const f of feeds.mine.filter((x) => x.name.startsWith("E2E ")))
      await request.delete(`${API}/feeds/${encodeURIComponent(f.id)}`, {
        headers: { authorization: `Bearer ${token}` },
      });
    await page
      .getByTestId("builder-input")
      .fill("ít bàn giá, ẩn shill, ưu tiên founder có nội dung, thêm thơ haiku");
    await page.getByTestId("builder-compile").click();
    await expect(page.getByTestId("builder-result")).toBeVisible();
    expect(await page.getByTestId("rule").count()).toBeGreaterThanOrEqual(2);
    await expect(page.getByTestId("unsupported")).toBeVisible();
    await expect(page.getByTestId("preview-meta")).toBeVisible();
    // Tắt 1 rule: preview chạy lại ngay trong trình duyệt.
    await page.getByTestId("rule").first().click();
    await expect(page.getByTestId("rule").first()).toHaveAttribute("aria-pressed", "false");
    await page.getByTestId("builder-name").fill(`E2E ${RUN}`);
    await page.getByTestId("builder-save").click();
    await page.waitForURL("/");
    await expect(page.getByRole("button", { name: `E2E ${RUN}` })).toBeVisible();
  });

  test("báo cáo bài → admin thấy report", async ({ page }) => {
    await page.goto("/");
    const post = page.getByTestId("post").first();
    await expect(post).toBeVisible();
    await post.getByTestId("post-menu").click();
    await page.getByTestId("report").click();
    await page.getByTestId("report-spam").click();
    await page.getByTestId("report-submit").click();
    await expect(page.getByText(/Reported|Đã báo cáo/)).toBeVisible();
    await page.goto("/admin");
    await expect(page.getByText("spam").first()).toBeVisible();
  });

  test("tUSD: faucet + mua Pro bằng permit (1 chữ ký + 1 tx)", async ({ page, request }) => {
    // Chạy lại nhiều lần thì faucet đang cooldown và số dư đã tiêu hết: owner mint thêm 10 tUSD (chỉ ở local).
    const net = (await (await request.get(`${API}/network`)).json()) as { contracts: { TestUSD: string } };
    await rpc("eth_sendTransaction", [
      {
        from: DEPLOYER,
        to: net.contracts.TestUSD,
        data: encodeFunctionData({
          abi: parseAbi(["function mint(address to, uint256 amount)"]),
          args: [ACCOUNT, 10_000_000n],
        }),
      },
    ]);
    await page.goto("/billing");
    const faucet = page.getByTestId("faucet");
    await expect(faucet).toBeVisible();
    if (await faucet.isEnabled()) {
      await faucet.click();
      await waitTxOk(page);
    }
    await expect(page.getByTestId("tusd-balance")).not.toHaveText("…");
    // Đợi toast cũ biến mất để không nhầm với tx mua Pro.
    await expect(page.getByTestId("tx-ok")).toHaveCount(0, { timeout: 15_000 });
    const buy = page.getByTestId("buy-pro");
    await expect(buy).toBeEnabled({ timeout: 20_000 });
    await buy.click();
    await waitTxOk(page);
    await expect(page.getByTestId("plan-card")).toContainText("Pro", { timeout: 30_000 });
  });
  test("tin nhắn E2E: bật khoá (1 chữ ký) → người lạ nhắn → Yêu cầu → chấp nhận → trả lời có Twemoji", async ({
    page,
    request,
  }) => {
    // 1) Bật tin nhắn trên "thiết bị" này: ký bằng ví (connector giả = Anvil #2), không tx.
    await page.goto("/messages");
    const enable = page.getByTestId("dm-enable");
    const tabs = page.getByTestId("dm-tab-main");
    await expect(enable.or(tabs)).toBeVisible();
    if (await enable.isVisible()) await enable.click();
    await expect(tabs).toBeVisible({ timeout: 30_000 });

    // 2) Một builder trong seed (có khoá nhắn tin) mà ví e2e chưa follow nhắn tới, mã hoá ở phía Node.
    const following = (await (await request.get(`${API}/users/${ACCOUNT}/following?limit=100`)).json()) as {
      items: { address: string | null }[];
    };
    const followed = new Set(following.items.map((a) => a.address));
    const persona = ["p08", "p09", "p10", "p11", "p12"]
      .map((k) => privateKeyToAccount(keccak256(toBytes(`socialonchain-seed:${k}`))))
      .find((a) => !followed.has(a.address.toLowerCase()));
    expect(persona).toBeTruthy();
    const p = persona as ReturnType<typeof privateKeyToAccount>;
    const issuedAt = Math.floor(Date.now() / 1000);
    const auth = { owner: p.address, key: p.address, chainId: 31337, issuedAt };
    const login = (await (
      await request.post(`${API}/auth/session`, {
        data: { ...auth, signature: await p.signMessage({ message: sessionAuthMessage(auth) }) },
      })
    ).json()) as { token: string };
    const pk = await dmKeyFromSignature(await p.signMessage({ message: dmDeriveMessage(p.address) }));
    const mine = (await (await request.get(`${API}/dm/keys/${ACCOUNT}`)).json()) as {
      current: { publicKey: Hex };
    };
    const k = await dmSharedKey(pk.privateKey, mine.current.publicKey, p.address, ACCOUNT as Address);
    const ping = `e2e ping ${RUN} 🔥`;
    const env = await dmEncrypt(k, { v: 1, t: "text", text: ping }, p.address, ACCOUNT as Address);
    const sent = await request.post(`${API}/dm/messages`, {
      headers: { authorization: `Bearer ${login.token}` },
      data: { to: ACCOUNT, senderKey: pk.publicKey, recipientKey: mine.current.publicKey, ...env },
    });
    expect(sent.status()).toBe(201);

    // 3) Trình duyệt tự giải mã. Lần chạy đầu: nằm ở Yêu cầu → chấp nhận; chạy lại: đã ở Chính.
    await page.reload();
    await page.getByTestId("dm-tab-requests").click();
    // 🔥 hiện bằng ảnh Twemoji (alt), nên lọc theo phần chữ.
    const reqRow = page.getByTestId("dm-thread").filter({ hasText: `e2e ping ${RUN}` });
    const inRequests = await reqRow
      .waitFor({ timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (inRequests) {
      await reqRow.getByTestId("dm-accept").click();
      await expect(reqRow).toHaveCount(0);
    }
    await page.getByTestId("dm-tab-main").click();
    const row = page.getByTestId("dm-thread").filter({ hasText: `e2e ping ${RUN}` });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.locator('img[alt="🔥"]')).toBeVisible();

    // 4) Mở cuộc trò chuyện, thả ❤️, trả lời có emoji → hiện bằng Twemoji.
    await row.click();
    const theirs = page.locator('[data-testid="dm-message"][data-mine="false"]').last();
    await expect(theirs).toContainText(`e2e ping ${RUN}`);
    await theirs.getByTestId("dm-bubble").click();
    await page.getByRole("button", { name: /❤️/ }).click();
    await expect(theirs.getByTestId("dm-reactions").locator('img[alt="❤️"]')).toBeVisible({ timeout: 15_000 });
    const reply = `chào ${RUN} 🙏`;
    await page.getByTestId("dm-input").fill(reply);
    await page.getByTestId("dm-send").click();
    const last = page.locator('[data-testid="dm-message"][data-mine="true"]').last();
    await expect(last).toContainText(`chào ${RUN}`);
    await expect(last.locator('img[alt="🙏"]')).toBeVisible();

    // 5) Builder giải mã được câu trả lời (vòng E2E đủ 2 chiều); server chỉ giữ ciphertext.
    const thread = (await (
      await request.get(`${API}/dm/threads/${ACCOUNT}`, {
        headers: { authorization: `Bearer ${login.token}` },
      })
    ).json()) as { messages: { sender: string; nonce: string; ciphertext: string; id: number }[] };
    const fromMe = thread.messages.filter((m) => m.sender === ACCOUNT);
    const texts = await Promise.all(fromMe.map((m) => dmDecrypt(k, m, ACCOUNT as Address, p.address)));
    expect(texts.some((x) => x?.t === "text" && x.text === reply)).toBe(true);
    expect(texts.some((x) => x?.t === "react" && x.emoji === "❤️")).toBe(true);
    expect(JSON.stringify(thread)).not.toContain(`chào ${RUN}`);
  });
});

/** Máy "trắng": tắt ví e2e tự mở khoá, đi qua intro (vai trò Reader) tới bước tài khoản. */
async function freshToAccountStep(page: Page) {
  await page.addInitScript(() => localStorage.setItem("soc:e2e-off", "1"));
  await page.goto("/welcome");
  await page.getByTestId("welcome-start").click();
  await page.getByTestId("role-reader").click();
  await page.getByTestId("role-continue").click();
  await page.getByTestId("role-next").click();
  await expect(page.getByTestId("password-input")).toBeVisible();
}

test("tài khoản mật khẩu: tạo (app tặng gas, tự lên chain) → xuất khoá → đăng xuất → máy khác đăng nhập (tự bật thiết bị)", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const handle = `pw_${RUN}`.slice(0, 20);
  const password = `e2e-pass-${RUN}`;

  // Máy A: tạo tài khoản. Không có popup nào: ví sinh trong máy, vòi tặng gas, registerWithDelegate tự gửi.
  await freshToAccountStep(page);
  await page.getByTestId("handle-input").fill(handle);
  await page.getByTestId("name-input").fill("Password Tester");
  await page.getByTestId("password-input").fill(password);
  await expect(page.getByTestId("account-submit")).toBeEnabled({ timeout: 15_000 });
  await page.getByTestId("account-submit").click();
  await expect(page.getByTestId("welcome-done")).toBeVisible({ timeout: 90_000 });
  const stored = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith("soc:wallet:"));
    return k ? (JSON.parse(localStorage.getItem(k) ?? "{}") as { address: string; handle: string }) : null;
  });
  expect(stored?.handle).toBe(handle);
  const address = (stored?.address ?? "").toLowerCase();

  // Tài khoản có trên server (tham số KDF công khai), danh tính onchain đã được index.
  const kdf = await (await fetch(`${API}/accounts/kdf/${handle}`)).json();
  expect(kdf.kdf.name).toBe("scrypt");
  expect((await fetch(`${API}/users/${address}`)).status).toBe(200);

  // Xuất khoá (hỏi lại mật khẩu) ra đúng private key của địa chỉ đó.
  await page.goto("/settings");
  await page.getByTestId("settings-export-key").click();
  await page.getByTestId("export-key-password").fill(password);
  await page.getByTestId("export-key-reveal").click();
  const exported = (await page.getByTestId("export-key-value").textContent())?.trim() as Hex;
  expect(exported).toMatch(/^0x[0-9a-f]{64}$/);
  expect(privateKeyToAccount(exported).address.toLowerCase()).toBe(address);
  await page.keyboard.press("Escape");

  // Đăng xuất: ví bị xoá khỏi máy.
  await page.getByTestId("settings-logout").click();
  await expect(page).toHaveURL(/\/welcome/, { timeout: 20_000 });
  expect(
    await page.evaluate(() => Object.keys(localStorage).filter((x) => x.startsWith("soc:wallet:"))),
  ).toEqual([]);

  // Máy B: sai mật khẩu → báo lỗi; đúng → mở khoá, tự addDelegate cho thiết bị mới.
  const ctx = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 393, height: 852 },
  });
  const b = await ctx.newPage();
  await freshToAccountStep(b);
  await b.getByTestId("auth-switch").click();
  await b.getByTestId("handle-input").fill(handle);
  await b.getByTestId("password-input").fill(`${password}-wrong`);
  await b.getByTestId("account-submit").click();
  await expect(b.getByTestId("account-hint")).toHaveText(/wrong|sai/i, { timeout: 30_000 });
  await b.getByTestId("password-input").fill(password);
  await b.getByTestId("account-submit").click();
  await expect(b.getByTestId("welcome-done")).toBeVisible({ timeout: 90_000 });
  const bAddr = await b.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith("soc:wallet:"));
    return k ? (JSON.parse(localStorage.getItem(k) ?? "{}") as { address: string }).address : null;
  });
  expect(bAddr?.toLowerCase()).toBe(address);
  await ctx.close();
});

test("nhập khoá ví cũ (đã đăng ký bằng ví ngoài) → mật khẩu yếu bị chặn → vào lại đúng handle → liên kết ví deployer", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const handle = `ik_${RUN}`.slice(0, 20);
  const password = `import-${RUN}-ok`;
  const net = (await (await request.get(`${API}/network`)).json()) as {
    contracts: { IdentityRegistry: Address };
  };

  // "Ví Core cũ": key ngẫu nhiên, đăng ký handle onchain trực tiếp (không qua app).
  const oldPk = generatePrivateKey();
  const old = privateKeyToAccount(oldPk);
  await rpc("eth_sendTransaction", [
    { from: DEPLOYER, to: old.address, value: `0x${parseEther("1").toString(16)}` },
  ]);
  await expect
    .poll(async () => BigInt((await rpc("eth_getBalance", [old.address, "latest"])) as string))
    .toBeGreaterThan(0n);
  const wc = createWalletClient({ account: old, chain: anvil, transport: http(RPC) });
  await wc.writeContract({
    address: net.contracts.IdentityRegistry,
    abi: parseAbi(["function register(string handle, string profileURI)"]),
    functionName: "register",
    args: [handle, ""],
  });
  await expect
    .poll(
      async () =>
        ((await (await request.get(`${API}/users/${old.address}`)).json()) as { handle?: string }).handle,
      {
        timeout: 30_000,
      },
    )
    .toBe(handle);

  // Nhập khoá: handle tự điền theo onchain; mật khẩu phổ biến bị chặn ngay ở client.
  await freshToAccountStep(page);
  await page.getByTestId("auth-switch").click();
  await page.getByTestId("auth-import").click();
  await page.getByTestId("import-key-input").fill("0x1234");
  await expect(page.getByTestId("account-hint")).toHaveText(/private key/i);
  await page.getByTestId("import-key-input").fill(oldPk.slice(2));
  await expect(page.getByTestId("import-address")).toBeVisible();
  await expect(page.getByTestId("handle-input")).toHaveValue(handle, { timeout: 15_000 });
  await page.getByTestId("password-input").fill("12345678");
  await expect(page.getByTestId("account-hint")).toHaveText(/common|phổ biến/i);
  await expect(page.getByTestId("account-submit")).toBeDisabled();
  await page.getByTestId("password-input").fill(password);
  await expect(page.getByTestId("account-submit")).toBeEnabled({ timeout: 15_000 });
  await page.getByTestId("account-submit").click();
  // Đã đăng ký sẵn → không đăng ký lại, chỉ bật thiết bị (addDelegate) rồi xong.
  await expect(page.getByTestId("welcome-done")).toBeVisible({ timeout: 90_000 });
  const stored = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith("soc:wallet:"));
    return k ? (JSON.parse(localStorage.getItem(k) ?? "{}") as { address: string; handle: string }) : null;
  });
  expect(stored?.address.toLowerCase()).toBe(old.address.toLowerCase());
  expect(stored?.handle).toBe(handle);
  const kdf = await (await fetch(`${API}/accounts/kdf/${handle}`)).json();
  expect(kdf.kdf.name).toBe("scrypt");

  // Liên kết ví deployer: ký tin nhắn bằng chính ví đó (ở ngoài app), dán vào Cài đặt.
  const deployer = privateKeyToAccount(generatePrivateKey());
  const stranger = privateKeyToAccount(generatePrivateKey());
  const msg = linkWalletMessage({ owner: old.address, wallet: deployer.address, chainId: anvil.id });
  await page.goto("/settings");
  await page.getByTestId("settings-builder-wallets").click();
  await page.getByTestId("link-address").fill(deployer.address);
  await expect(page.getByTestId("link-message")).toHaveText(msg);
  // Chữ ký của ví khác → bị từ chối.
  await page.getByTestId("link-signature").fill(await stranger.signMessage({ message: msg }));
  await page.getByTestId("link-submit").click();
  await expect(page.getByText(/doesn't match|không khớp/i)).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("link-signature").fill(await deployer.signMessage({ message: msg }));
  await page.getByTestId("link-submit").click();
  await expect(page.getByTestId("linked-wallet")).toHaveCount(1, { timeout: 15_000 });
  const user = (await (await request.get(`${API}/users/${old.address}`)).json()) as {
    linkedWallets: string[];
  };
  expect(user.linkedWallets).toEqual([deployer.address.toLowerCase()]);
});
