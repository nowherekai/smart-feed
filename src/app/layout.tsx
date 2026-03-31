import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "smart-feed",
  description: "Personal intelligence pipeline workspace.",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
