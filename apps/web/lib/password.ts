import { PASSWORD_MIN } from "@socialonchain/protocol";

/**
 * Kiểm mật khẩu ở client (server không bao giờ thấy mật khẩu, nên chỉ kiểm được ở đây).
 * Lộ DB thì kẻ tấn công dò offline: chặn các mật khẩu phổ biến nhất + những mẫu dò ra ngay.
 * Danh sách ngắn, có chủ đích: không thay được một bộ lọc đầy đủ (backlog trước mainnet).
 */
const COMMON = new Set([
  "password",
  "password1",
  "password123",
  "passw0rd",
  "12345678",
  "123456789",
  "1234567890",
  "0123456789",
  "87654321",
  "11111111",
  "00000000",
  "12341234",
  "11223344",
  "qwertyui",
  "qwerty123",
  "qwertyuiop",
  "asdfghjk",
  "zxcvbnm1",
  "1q2w3e4r",
  "1qaz2wsx",
  "abc12345",
  "abcd1234",
  "a1b2c3d4",
  "iloveyou",
  "iloveyou1",
  "letmein1",
  "welcome1",
  "admin123",
  "administrator",
  "football",
  "baseball",
  "sunshine",
  "princess",
  "superman",
  "starwars",
  "dragon12",
  "monkey12",
  "trustno1",
  "changeme",
  "matkhau",
  "matkhau1",
  "matkhau123",
  "anhyeuem",
  "anhyeuem1",
  "emyeuanh",
  "emyeuanh1",
  "yeuemmaimai",
  "vietnam1",
  "vietnam123",
  "hanoi123",
  "saigon123",
  "avalanche",
  "avalanche1",
  "bitcoin1",
  "ethereum",
  "metamask",
  "socialonchain",
]);

export type PasswordProblem = "short" | "common" | "handle" | "pattern";

export function passwordProblem(password: string, handle: string): PasswordProblem | null {
  const pw = password.normalize("NFKC");
  if (pw.length < PASSWORD_MIN) return "short";
  const low = pw.toLowerCase();
  if (COMMON.has(low)) return "common";
  if (handle && low.includes(handle.toLowerCase()) && pw.length - handle.length < 4) return "handle";
  // Một ký tự lặp lại, hoặc dãy tăng/giảm đều (12345678, abcdefgh, 98765432).
  if (/^(.)\1+$/.test(low)) return "pattern";
  const codes = [...low].map((c) => c.codePointAt(0) ?? 0);
  const steps = new Set(codes.slice(1).map((c, i) => c - (codes[i] ?? 0)));
  if (steps.size === 1 && [1, -1].includes([...steps][0] ?? 0)) return "pattern";
  return null;
}
