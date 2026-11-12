export type ClientConfig = {
  id: "a" | "b";
  appName: string;
  /** Câu ngắn, mỗi câu kết thúc bằng dấu chấm (splash tách mỗi câu thành 1 dòng). */
  tagline: { en: string; vi: string };
  /** Chữ cái/ký hiệu logo (SVG inline trong components/Logo). */
  logo: { mark: string };
  theme: { accent: string; accentInk: string; radius: string };
  /** Theme khi người dùng chưa tự chọn (Settings). Bỏ trống = theo hệ thống. */
  defaultTheme?: "light" | "dark";
  defaultFeeds: string[];
  defaultModeration: string[];
  enabledSources: string[];
  /** Ghi đè qua NEXT_PUBLIC_API_URL. */
  indexerUrl: string;
  chain: "local" | "fuji";
  plans: {
    id: number;
    name: string;
    priceUsd: number;
    months: number;
    compilesPerDay: number;
    maxFeeds: number;
  }[];
  freeLimits: { compilesPerDay: number; maxFeeds: number };
};
