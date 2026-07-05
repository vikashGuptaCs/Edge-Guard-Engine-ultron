import React from "react";
import { LiveTicker } from "@/components/dashboard/LiveTicker";
import { RiskGrid } from "@/components/dashboard/RiskGrid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";

export default function OverviewPage() {
  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold font-mono tracking-tight text-foreground flex items-center gap-2">
          <Activity className="w-6 h-6 text-primary" />
          TERMINAL_OVERVIEW
        </h1>
        <p className="text-sm font-mono text-muted-foreground">Real-time market tracking and risk analysis.</p>
      </div>

      <div className="border border-border/50 rounded-lg overflow-hidden bg-card shadow-sm">
        <div className="bg-muted px-4 py-2 border-b font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Live Market Feed
        </div>
        <LiveTicker />
      </div>

      <Card className="flex-1 border-border/50 shadow-sm flex flex-col overflow-hidden">
        <CardHeader className="py-3 px-4 border-b bg-muted/30">
          <CardTitle className="text-sm font-mono uppercase tracking-wider flex justify-between items-center">
            <span>Active Risk Grid</span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] text-green-500">LIVE</span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 flex-1 overflow-auto">
          <RiskGrid />
        </CardContent>
      </Card>
    </div>
  );
}
