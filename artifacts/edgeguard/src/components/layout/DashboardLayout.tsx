import React from "react";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { StatsBar } from "./StatsBar";
import { RiskAgentProvider } from "@/contexts/RiskAgentContext";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <RiskAgentProvider>
      <div className="min-h-[100dvh] flex flex-col bg-background text-foreground font-sans overflow-hidden">
        <TopBar />
        <StatsBar />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto bg-background/50">
            <div className="container mx-auto p-4 md:p-6 max-w-7xl h-full">
              {children}
            </div>
          </main>
        </div>
      </div>
    </RiskAgentProvider>
  );
}
