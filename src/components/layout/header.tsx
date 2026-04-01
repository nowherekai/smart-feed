"use client";

import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function Header() {
  const pathname = usePathname();

  const getTitle = () => {
    switch (pathname) {
      case "/":
        return "Dashboard";
      case "/digest":
        return "Daily Digest";
      case "/sources":
        return "Sources";
      case "/settings":
        return "Settings";
      default:
        return "Smart Feed";
    }
  };

  return (
    <header className="h-16 border-b border-border flex items-center justify-between px-8 bg-background/80 backdrop-blur-md sticky top-0 z-10 w-full">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold capitalize">{getTitle()}</h2>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <Input className="pl-10 w-64 bg-muted/50 h-9 text-sm" placeholder="Search intelligence..." />
        </div>
        <Link href="/sources" className={buttonVariants({ size: "sm" })}>
          <Plus size={16} className="mr-2" /> New Source
        </Link>
      </div>
    </header>
  );
}
