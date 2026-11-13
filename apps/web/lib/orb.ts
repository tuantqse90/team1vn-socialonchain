/**
 * Nền "orb" gradient tất định theo seed (địa chỉ, fid, id feed): cùng seed → cùng màu ở mọi màn.
 * Bảng màu xoay quanh đỏ Avalanche, thêm vài sắc phụ để feed không đơn điệu. Chỉ CSS, không ảnh.
 */
const PALETTE: [string, string, string][] = [
  ["#e84142", "#ff8a4c", "#ffd29d"], // đỏ → cam
  ["#e84142", "#7a1fa2", "#ff7aa8"], // đỏ → mận
  ["#0b0b0c", "#e84142", "#ff9a7a"], // mực → đỏ
  ["#ffb547", "#e84142", "#fff1c9"], // hổ phách → đỏ
  ["#ff5f8f", "#5b21b6", "#ffc2d6"], // hồng → tím
  ["#1e3a8a", "#e84142", "#8fb3ff"], // navy → đỏ
  ["#0f766e", "#0b0b0c", "#5eead4"], // teal → mực
  ["#f97316", "#b91c1c", "#fde68a"], // cam → đỏ đậm
];

/** FNV-1a 32 bit: phân bố đều hơn hash cộng dồn cho chuỗi gần giống nhau (địa chỉ liền kề). */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function orbBackground(seed: string): string {
  const h = hash(seed.toLowerCase());
  const [a, b, c] = PALETTE[h % PALETTE.length] as [string, string, string];
  const angle = (h >>> 3) % 360;
  const x = 18 + ((h >>> 11) % 64);
  const y = 14 + ((h >>> 17) % 56);
  return [
    "radial-gradient(circle at 30% 22%, rgba(255,255,255,.38), transparent 36%)",
    `radial-gradient(circle at ${x}% ${y}%, ${c}, transparent 60%)`,
    `linear-gradient(${angle}deg, ${a}, ${b})`,
  ].join(",");
}
