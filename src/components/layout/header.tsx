"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";

const TITLE_BY_PATH: Record<string, string> = {
  "/": "Dashboard",
  "/digest": "Daily Digest",
  "/sources": "Sources",
  "/settings": "Settings",
};

export function Header() {
  const pathname = usePathname();
  const title = TITLE_BY_PATH[pathname] ?? "Smart Feed";

  return (
    <header className="h-16 border-b border-border flex items-center justify-between px-8 bg-background/80 backdrop-blur-md sticky top-0 z-10 w-full">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold capitalize">{title}</h2>
      </div>
      <div className="flex items-center gap-4">
        <Link href="/sources" className={buttonVariants({ size: "sm" })}>
          <Plus size={16} className="mr-2" /> New Source
        </Link>
      </div>
    </header>
  );
}
