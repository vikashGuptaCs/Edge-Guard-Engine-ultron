import React, { useMemo } from "react";
import { useGetAgentHeartbeats, useListAgentSignals } from "@workspace/api-client-react";
import { AgentCard } from "@/components/dashboard/AgentCard";
import { WorkerStatusBadge } from "@/components/dashboard/WorkerStatusBadge";
import { useRiskAgentContext } from "@/contexts/RiskAgentContext";
import { Cpu, Activity, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

const AGENT_NAMES = ['Sentinel', 'Overreaction', 'Volatility', 'Pattern', 'Orchestrator'] as const;

const signalColor = (sig: string) => {
  if (sig.includes('CIRCUIT_BREAKER') || sig.includes('VETO') || sig.includes('SPOOF') || sig.includes('TOXIC'))
    return 'text-red-500 border-red-500/50';
  if (sig === 'EXECUTE' || sig === 'CLEAR' || sig === 'FAIR_VALUE' || sig === 'PATTERN_CLEAR' || sig === 'LOW_VOLATILITY')
    return 'text-green-500 border-green-500/50';
  return 'text-amber-500 border-amber-500/50';
};

export default function AgentsPage() {
  const { data: heartbeats = [], isLoading } = useGetAgentHeartbeats({
    query: { refetchInterval: 5000 }
  });

  const { data: serverSignals = [], isLoading: isLoadingSignals } = useListAgentSignals({ limit: 10 }, {
    query: { refetchInterval: 5000 }
  });

  const { workerStatus, allFixtureRisks, getAgentSignal } = useRiskAgentContext();
  const workerLive = workerStatus === 'running';

  // Collect the latest worker signal per agent across all fixtures
  const workerAgentSummary = useMemo(() => {
    if (!workerLive) return new Map<string, { signalType: string; confidence: number; fixtureId: number; ts: number }>();

    const result = new Map<string, { signalType: string; confidence: number; fixtureId: number; ts: number }>();
    for (const [fid, risk] of allFixtureRisks) {
      for (const sig of risk.signals) {
        const existing = result.get(sig.agentName);
        if (!existing || risk.ts > existing.ts) {
          result.set(sig.agentName, {
            signalType: sig.signalType,
            confidence: sig.confidence,
            fixtureId: fid,
            ts: risk.ts,
          });
        }
      }
    }
    return result;
  }, [allFixtureRisks, workerLive]);

  // Build flat list of live worker events for the feed
  const workerFeed = useMemo(() => {
    const events: Array<{
      agentName: string;
      signalType: string;
      confidence: number;
      fixtureId: number;
      ts: number;
    }> = [];
    for (const [fid, risk] of allFixtureRisks) {
      for (const sig of risk.signals) {
        events.push({ agentName: sig.agentName, signalType: sig.signalType, confidence: sig.confidence, fixtureId: fid, ts: risk.ts });
      }
    }
    return events.sort((a, b) => b.ts - a.ts).slice(0, 20);
  }, [allFixtureRisks]);

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
            <Cpu className="w-6 h-6 text-primary" />
            AGENT_ENSEMBLE
          </h1>
          <p className="text-sm font-mono text-muted-foreground">Status and verdicts of all concurrent analytical agents.</p>
        </div>
        <div className="mt-1">
          <WorkerStatusBadge />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-2">
        {/* Agent cards */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-5">
          {isLoading && heartbeats.length === 0 ? (
            Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)
          ) : (
            heartbeats.map(agent => {
              const liveWorker = workerAgentSummary.get(agent.agentName);
              return (
                <AgentCard key={agent.agentName} agent={agent} workerSignal={liveWorker} />
              );
            })
          )}
        </div>

        {/* Live feeds column */}
        <div className="flex flex-col gap-4">
          {/* Worker Signals Feed */}
          <div className="border bg-card/30 rounded-lg flex flex-col" style={{ maxHeight: 340 }}>
            <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
              <h3 className="font-mono text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                <Zap className="w-4 h-4 text-cyan-400" /> Worker Feed
              </h3>
              {workerLive && (
                <span className="text-[10px] font-mono text-cyan-400 animate-pulse">LIVE</span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {!workerLive ? (
                <div className="text-center text-muted-foreground text-xs font-mono mt-4 px-2">
                  Workers start automatically when fixtures are live
                </div>
              ) : workerFeed.length === 0 ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                workerFeed.map((event, i) => (
                  <div key={`${event.fixtureId}-${event.agentName}-${i}`}
                       className="border-b border-border/40 pb-2 last:border-0 last:pb-0">
                    <div className="flex justify-between items-start mb-0.5">
                      <span className="font-mono font-bold text-[10px] text-cyan-400">{event.agentName}</span>
                      <span className="text-[9px] text-muted-foreground font-mono">
                        {format(new Date(event.ts), "HH:mm:ss.SSS")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-[9px] h-4 uppercase ${signalColor(event.signalType)}`}>
                        {event.signalType}
                      </Badge>
                      <span className="text-[9px] text-muted-foreground font-mono">
                        Fix #{event.fixtureId} · {(event.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Server Signals Feed */}
          <div className="border bg-card/30 rounded-lg flex flex-col flex-1" style={{ maxHeight: 300 }}>
            <div className="p-3 border-b bg-muted/30">
              <h3 className="font-mono text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" /> Server Signals
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {isLoadingSignals && serverSignals.length === 0 ? (
                <Skeleton className="h-16 w-full" />
              ) : serverSignals.length === 0 ? (
                <div className="text-center text-muted-foreground text-xs font-mono mt-4">No recent signals</div>
              ) : (
                serverSignals.map(signal => (
                  <div key={signal.id} className="border-b border-border/50 pb-2 last:border-0 last:pb-0">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-mono font-bold text-xs text-primary">{signal.agentName}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {format(new Date(signal.ts), "HH:mm:ss")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className={`text-[9px] h-4 uppercase ${signalColor(signal.signalType)}`}>
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
      </div>

      <div className="mt-4 border rounded-lg bg-card/20 p-6 flex flex-col gap-4">
        <h3 className="font-mono text-sm font-bold uppercase tracking-wider flex items-center gap-2">
          <Activity className="w-4 h-4 text-accent" />
          Ensemble Architecture Notes
        </h3>
        <ul className="text-sm font-mono text-muted-foreground space-y-2 list-disc pl-5">
          <li><strong>Sentinel:</strong> High-priority hardware interrupter. Detects latency spikes &gt;250ms and spread expansion. Triggers CIRCUIT_BREAKER to lock autopilot.</li>
          <li><strong>Overreaction:</strong> Monitors price velocity ratio. Detects retail mispricing after score events (velocityRatio &gt;5x baseline → OVERREACTION_BUY).</li>
          <li><strong>Volatility:</strong> Rolling σ of spread sequences. HIGH_VOLATILITY (σ &gt;0.04) triggers VETO_SLIPPAGE to protect fill quality.</li>
          <li><strong>Pattern:</strong> Detects spoofing (Z-score spike + reversion) and order layering (≥60% sustained spread widening).</li>
          <li><strong>Orchestrator:</strong> Weighted 4-agent consensus. Requires ≥3/4 votes + edgeScore ≥75 for EXECUTE. Sentinel VETO always overrides.</li>
        </ul>
        <div className="mt-2 text-[11px] font-mono text-cyan-400/70 flex items-center gap-2">
          <Zap className="w-3.5 h-3.5" />
          All algorithms run in a dedicated Web Worker — zero main-thread impact.
        </div>
      </div>
    </div>
  );
}
