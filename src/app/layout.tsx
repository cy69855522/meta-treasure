import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getSettings } from "@/lib/settings";
import { themeBootScript } from "@/lib/theme-boot";
import { ThemeSync } from "@/components/theme-sync";
import { cn } from "@/lib/utils";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Progress · 无压多项目管理",
  description:
    "个人多项目无压管理：Inbox + Now/Next/Later，服务 3D Infra / AI 漫剧 / AI 选品",
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = getSettings();

  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={cn(
        geistSans.variable,
        geistMono.variable,
        "h-full antialiased",
        settings.theme === "dark" && "dark",
      )}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: themeBootScript(settings.theme) }}
        />
      </head>
      <body className="min-h-full bg-background font-sans text-foreground">
        <ThemeSync theme={settings.theme} />
        {children}
      </body>
    </html>
  );
}
