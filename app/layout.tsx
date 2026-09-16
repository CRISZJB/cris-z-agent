import type { Metadata } from "next";
import { Noto_Sans_SC, Noto_Serif_SC } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const serif = Noto_Serif_SC({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "700"],
});

const sans = Noto_Sans_SC({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Cris.Z Agent",
    template: "%s · Cris.Z Agent",
  },
  description: "面向日常、工作、学习和求职的个人 AI Agent。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className={`${serif.variable} ${sans.variable}`}>
      <body>
        <header className="site-nav">
          <Link href="/">首页</Link>
          <Link href="/agent">聊天</Link>
          <Link href="/knowledge">知识库</Link>
          <Link href="/job-assistant">求职助手</Link>
          <Link href="/settings">设置</Link>
        </header>
        {children}
      </body>
    </html>
  );
}
