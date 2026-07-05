import React from "react";
import { useGetDashboardSummary } from "@workspace/api-client-react";
import { Activity, Clock, Cpu, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function StatsBar() {
  const { data: summary, isLoading } = useGetDashboardSummary({
    query: { refetchInterval: 5000 }
  });

  return (
    <div className="border-b bg-card/30 flex items-center justify-between px-4 py-2 text-xs font-mono text-muted-foreground overflow-x-auto whitespace-nowrap hide-scrollbar">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-primary/70" />
          <span>LATENCY:</span>
          {isLoading ? (
            <Skeleton className="w-8 h-4 inline-block" />
          ) : (
            <span className={summary && summary.feedLatencyMs > 200 ? "text-destructive" : "text-foreground"}>
              {summary?.feedLatencyMs ?? 0}ms
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5 text-accent/70" />
          <span>AGENTS:</span>
          {isLoading ? (
            <Skeleton className="w-4 h-4 inline-block" />
          ) : (
            <span className="text-foreground">{summary?.activeAgents ?? 0}/5</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-yellow-500/70" />
          <span>ALERTS/HR:</span>
          {isLoading ? (
            <Skeleton className="w-6 h-4 inline-block" />
          ) : (
            <span className="text-foreground">{summary?.alertsPerHour ?? 0}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-green-500/70" />
          <span>FIXTURES:</span>
          {isLoading ? (
            <Skeleton className="w-4 h-4 inline-block" />
          ) : (
            <span className="text-foreground">{summary?.activeFixtures ?? 0}</span>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <span>EXECUTED: <span className="text-foreground">{summary?.executedToday ?? 0}</span></span>
        <span>VETOED: <span className="text-foreground">{summary?.vetoedToday ?? 0}</span></span>
      </div>
    </div>
  );
}
