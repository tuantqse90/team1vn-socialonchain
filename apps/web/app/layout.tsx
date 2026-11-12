import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import type { CSSProperties, ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { OnboardingFlush } from "@/components/onboarding/Flush";
import { clientConfig } from "@/configs";
import "./globals.css";
import { Providers } from "./providers";

const sans = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: clientConfig.appName, template: `%s · ${clientConfig.appName}` },
  description: clientConfig.tagline.en,
  applicationName: clientConfig.appName,
  appleWebApp: { capable: true, title: clientConfig.appName, statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: { icon: "/brand/icon", apple: "/brand/icon" },
};

const THEME_COLOR = { light: "#ffffff", dark: "#0b0b0c" } as const;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Client có theme mặc định (vd. client B tối) thì thanh trạng thái theo theme đó; còn lại theo hệ thống.
  themeColor: clientConfig.defaultTheme
    ? THEME_COLOR[clientConfig.defaultTheme]
    : [
        { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
        { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
      ],
};

/**
 * Đặt theme trước khi vẽ để không nháy. Lựa chọn của người dùng (localStorage) thắng; chưa chọn thì theo
 * `defaultTheme` của client, rồi theo hệ thống.
 */
const defaultTheme = JSON.stringify(clientConfig.defaultTheme ?? "system");
const themeScript = `(function(){var t=${defaultTheme};try{t=localStorage.getItem('soc:theme')||t}catch(e){}try{var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){}})()`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const style = {
    "--accent": clientConfig.theme.accent,
    "--accent-ink": clientConfig.theme.accentInk,
    "--radius": clientConfig.theme.radius,
  } as CSSProperties;
  return (
    <html
      lang={locale}
      className={`${sans.variable} ${mono.variable}`}
      data-theme={clientConfig.defaultTheme}
      style={style}
      suppressHydrationWarning
    >
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: script tĩnh, không có dữ liệu người dùng */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>
            <OnboardingFlush />
            <AppShell>{children}</AppShell>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
