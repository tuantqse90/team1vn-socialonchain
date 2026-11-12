import { DEFAULT_SESSION_FUNDING_WEI } from "@socialonchain/protocol";
import { parseEther } from "viem";
import { network } from "./chain";

/**
 * Mức gas theo mạng. Fuji hiện ~160 wei/gas (1 bài ~100k gas ≈ 1.6e-11 AVAX), tài khoản mới được app tặng
 * 0.001 AVAX (người dùng chốt 2026-11-12): nửa nạp cho session key, owner giữ nửa còn lại cho tx của ví chính
 * (bật thiết bị khác, thu hồi key…). Nếu phí Fuji tăng mạnh thì phải nâng các mức này + lượng tặng.
 * Local (Anvil) giữ mức cũ.
 */
const FUJI = network.name === "fuji";

/** Gas nạp cho session key khi đăng ký / bật thiết bị / gia hạn. */
export const SESSION_FUNDING_WEI = FUJI ? parseEther("0.0005") : DEFAULT_SESSION_FUNDING_WEI;
/** Dưới mức này thì nhắc nạp thêm. */
export const LOW_GAS_WEI = FUJI ? parseEther("0.0002") : parseEther("0.01");
/** Dưới mức này coi như hết gas: khoá nút đăng, mở sheet nạp. */
export const EMPTY_GAS_WEI = FUJI ? parseEther("0.00002") : parseEther("0.0001");
/** Các mức nạp gợi ý cho session key (AVAX). */
export const TOP_UP_OPTIONS = FUJI
  ? (["0.0001", "0.0002", "0.0004"] as const)
  : (["0.02", "0.05", "0.1"] as const);
/** Phần owner chừa lại để trả phí các tx của ví chính (đăng ký, bật thiết bị, thu hồi…). */
export const OWNER_FEE_RESERVE_WEI = FUJI ? parseEther("0.0001") : parseEther("0.01");
/** Owner cần tối thiểu chừng này để gửi tx đăng ký (phần nạp cho session key + phí). Vòi tặng gas phải ≥ mức này. */
export const MIN_OWNER_WEI = SESSION_FUNDING_WEI + OWNER_FEE_RESERVE_WEI;
