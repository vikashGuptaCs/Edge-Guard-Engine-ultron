import React from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Swords, 
  Cpu, 
  BellRing, 
  ReceiptText, 
  Settings 
} from "lucide-react";

export function Sidebar() {
  const [location] = useLocation();

  const navItems = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
    { href: "/dashboard/matches", label: "Matches", icon: Swords },
    { href: "/dashboard/agents", label: "Agents", icon: Cpu },
    { href: "/dashboard/alerts", label: "Alerts", icon: BellRing },
    { href: "/dashboard/receipts", label: "Receipts", icon: ReceiptText },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ];

  return (
    <aside className="w-64 border-r bg-card/50 flex flex-col h-full hidden md:flex">
      <div className="flex-1 py-4 flex flex-col gap-1 px-2">
        {navItems.map((item) => {
          const isActive = item.exact
            ? location === item.href
            : location.startsWith(item.href);

          return (
            <Link key={item.href} href={item.href}>
              <div
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors text-sm font-medium ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <item.icon className={`w-4 h-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                {item.label}
              </div>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
