import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: "smart-feed",
  description: "Personal intelligence pipeline workspace.",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN" className="font-sans antialiased">
      {process.env.NODE_ENV === "development" && (
        <head>
          <script async crossOrigin="anonymous" src="https://tweakcn.com/live-preview.min.js" />
        </head>
      )}
      <body className="flex h-screen bg-background text-foreground overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden relative">
          <Header />
          <TooltipProvider delay={0}>{children}</TooltipProvider>
        </main>
        <Toaster />
      </body>
    </html>
  );
}
