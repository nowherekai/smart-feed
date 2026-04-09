"use client";

import { Activity, BarChart3, Brain, FileText, LayoutDashboard, Newspaper, Rss, Settings, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-border flex flex-col bg-background h-screen sticky top-0">
      <div className="p-6 flex items-center gap-2">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
          <Zap className="text-primary-foreground w-5 h-5" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-primary">smart-feed</h1>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        <NavItem icon={<LayoutDashboard size={20} />} label="Dashboard" href="/" active={pathname === "/"} />
        <NavItem icon={<FileText size={20} />} label="Digest 候选" href="/digest" active={pathname === "/digest"} />
        <NavItem
          icon={<FileText size={20} />}
          label="Digest 归档"
          href="/digests"
          active={pathname.startsWith("/digests")}
        />
        <NavItem icon={<Brain size={20} />} label="Analysis" href="/analysis" active={pathname === "/analysis"} />
        <NavItem icon={<BarChart3 size={20} />} label="Stats" href="/stats" active={pathname === "/stats"} />
        <NavItem icon={<Activity size={20} />} label="Ops" href="/admin/ops" active={pathname === "/admin/ops"} />
        <NavItem
          icon={<Newspaper size={20} />}
          label="Original Feeds"
          href="/original-content"
          active={pathname === "/original-content"}
        />
        <NavItem icon={<Rss size={20} />} label="Sources" href="/sources" active={pathname === "/sources"} />
        <NavItem icon={<Settings size={20} />} label="Settings" href="/settings" active={pathname === "/settings"} />
      </nav>

      <div className="p-4 border-t border-border">{/* Mock mode badge removed */}</div>
    </aside>
  );
}

function NavItem({
  icon,
  label,
  href,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "bg-primary/10 text-primary shadow-sm"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}
