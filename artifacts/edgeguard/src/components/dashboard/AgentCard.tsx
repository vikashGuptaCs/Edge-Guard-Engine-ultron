import React from "react";
import { AgentHeartbeat } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Zap } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface WorkerSignalSummary {
  signalType: string;
  confidence: number;
  fixtureId: number;
  ts: number;
}

interface AgentCardProps {
  agent: AgentHeartbeat;
  workerSignal?: WorkerSignalSummary;
}

const signalBadgeColor = (sig: string) => {
  if (sig.includes('CIRCUIT_BREAKER') || sig.includes('VETO') || sig.includes('SPOOF') || sig.includes('TOXIC'))
    return 'text-red-500 border-red-500/40 bg-red-500/5';
  if (['CLEAR', 'FAIR_VALUE', 'PATTERN_CLEAR', 'LOW_VOLATILITY', 'EXECUTE'].includes(sig))
    return 'text-green-500 border-green-500/40 bg-green-500/5';
  return 'text-amber-400 border-amber-400/40 bg-amber-400/5';
};

export function AgentCard({ agent, workerSignal }: AgentCardProps) {
  const statusColors = {
    ACTIVE: "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]",
    PAUSED: "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]",
    ALERT:  "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]",
  };
  const statusColor = statusColors[agent.status as keyof typeof statusColors] ?? statusColors.ACTIVE;

  // Live confidence from the worker takes priority; otherwise use the real
  // confidence from the agent's last persisted signal (see agents.ts route
  // change 2.7 — do not fall back to a random number here).
  const confidence = workerSignal != null
    ? workerSignal.confidence * 100
    : (agent.confidence ?? 0);

  return (
    <Card className="bg-card/40 backdrop-blur-md border-border/50 hover:border-primary/50 transition-all group overflow-hidden relative">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity" />
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-mono tracking-tight font-medium flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${statusColor} ${agent.status === 'ACTIVE' ? 'animate-pulse' : ''}`} />
          {agent.agentName}
        </CardTitle>
        <div className="flex items-center gap-2">
          {workerSignal && (
            <span title="Worker-computed">
              <Zap className="w-3 h-3 text-cyan-400" />
            </span>
          )}
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
            {agent.status}
          </span>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col gap-3">
          {/* Verdict / Worker signal */}
          <div className="flex justify-between items-end">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground font-mono uppercase">
                {workerSignal ? 'Worker Signal' : 'Verdict'}
              </span>
              {workerSignal ? (
                <Badge variant="outline" className={`text-[10px] h-5 uppercase font-mono ${signalBadgeColor(workerSignal.signalType)}`}>
                  {workerSignal.signalType}
                </Badge>
              ) : (
                <span className={`text-xs font-mono font-bold ${
                  agent.status === 'ACTIVE' ? 'text-green-500' :
                  agent.status === 'ALERT'  ? 'text-red-500'   : 'text-foreground'
                }`}>
                  {agent.status ?? "MONITORING"}
                </span>
              )}
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-muted-foreground font-mono uppercase">Active Fixtures</span>
              <span className="text-xs font-mono">{agent.activeFixtures}</span>
            </div>
          </div>

          {/* Confidence bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] font-mono">
              <span className="text-muted-foreground">
                Confidence{workerSignal ? <span className="text-cyan-400 ml-1">[W]</span> : null}
              </span>
              <span className={workerSignal ? 'text-cyan-400' : ''}>{confidence.toFixed(1)}%</span>
            </div>
            <Progress
              value={confidence}
              className={`h-1.5 ${workerSignal ? '[&>div]:bg-cyan-400' : ''}`}
            />
          </div>

          {/* Footer: worker fixture or last-signal time */}
          <div className="text-[10px] text-muted-foreground font-mono text-right mt-1">
            {workerSignal
              ? <span className="text-cyan-400/70">Fix #{workerSignal.fixtureId} · live</span>
              : agent.lastSignalTs
                ? `Last signal: ${formatDistanceToNow(agent.lastSignalTs, { addSuffix: true })}`
                : 'Last signal: Never'}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
