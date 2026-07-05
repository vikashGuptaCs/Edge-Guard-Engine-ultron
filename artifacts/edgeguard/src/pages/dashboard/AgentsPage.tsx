import React from "react";
import { useGetAgentHeartbeats, useListAgentSignals } from "@workspace/api-client-react";
import { AgentCard } from "@/components/dashboard/AgentCard";
import { Cpu, ShieldAlert, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function AgentsPage() {
  const { data: heartbeats = [], isLoading } = useGetAgentHeartbeats({
    query: { refetchInterval: 5000 }
  });
  
  const { data: signals = [], isLoading: isLoadingSignals } = useListAgentSignals({ limit: 10 }, {
    query: { refetchInterval: 5000 }
  });

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
          <Cpu className="w-6 h-6 text-primary" />
          AGENT_ENSEMBLE
        </h1>
        <p className="text-sm font-mono text-muted-foreground">Status and verdicts of all concurrent analytical agents.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
          {isLoading && heartbeats.length === 0 ? (
            Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)
          ) : (
            heartbeats.map(agent => (
              <AgentCard key={agent.agentName} agent={agent} />
            ))
          )}
        </div>
        
        <div className="border bg-card/30 rounded-lg flex flex-col h-[500px]">
          <div className="p-3 border-b bg-muted/30">
            <h3 className="font-mono text-sm font-bold uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" /> Recent Ensemble Signals
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {isLoadingSignals && signals.length === 0 ? (
              <Skeleton className="h-16 w-full" />
            ) : signals.length === 0 ? (
              <div className="text-center text-muted-foreground text-xs font-mono mt-4">No recent signals</div>
            ) : (
              signals.map(signal => (
                <div key={signal.id} className="border-b border-border/50 pb-2 last:border-0 last:pb-0">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-mono font-bold text-xs text-primary">{signal.agentName}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {format(new Date(signal.ts), "HH:mm:ss")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className={`text-[9px] h-4 uppercase ${
                      signal.signalType.includes('VETO') || signal.signalType === 'CIRCUIT_BREAKER' ? 'text-red-500 border-red-500/50' : 
                      signal.signalType.includes('EXECUTE') ? 'text-green-500 border-green-500/50' : 
                      'text-amber-500 border-amber-500/50'
                    }`}>
                      {signal.signalType}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground font-mono">Fix #{signal.fixtureId}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 border rounded-lg bg-card/20 p-6 flex flex-col gap-4">
        <h3 className="font-mono text-sm font-bold uppercase tracking-wider flex items-center gap-2">
          <Activity className="w-4 h-4 text-accent" />
          Ensemble Architecture Notes
        </h3>
        <ul className="text-sm font-mono text-muted-foreground space-y-2 list-disc pl-5">
          <li><strong>Sentinel:</strong> High-priority hardware interrupter. Can trigger CIRCUIT_BREAKER to lock autopilot.</li>
          <li><strong>Volatility:</strong> Monitors spread gaps and liquidity drain. Vetoes on high slippage risk.</li>
          <li><strong>Overreaction:</strong> Detects retail flow mispricing after score events. Generates BUY/SELL signals.</li>
          <li><strong>Pattern:</strong> Historical regression matching. Slower, higher confidence.</li>
          <li><strong>Orchestrator:</strong> Aggregates signals. Requires 3/4 consensus (Sentinel VETO overrides all).</li>
        </ul>
      </div>
    </div>
  );
}
