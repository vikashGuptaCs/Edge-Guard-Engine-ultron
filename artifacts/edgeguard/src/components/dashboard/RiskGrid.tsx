import React from "react";
import { useGetRiskGrid } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useRiskAgentContext } from "@/contexts/RiskAgentContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Zap } from "lucide-react";

export function RiskGrid() {
  const { data: gridItems = [], isLoading } = useGetRiskGrid({
    query: { refetchInterval: 5000 }
  });

  const { workerStatus, getFixtureRisk } = useRiskAgentContext();
  const workerLive = workerStatus === 'running';

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'CRITICAL': return 'bg-red-500/10 text-red-500 border-red-500/50';
      case 'HIGH': return 'bg-orange-500/10 text-orange-500 border-orange-500/50';
      case 'MEDIUM': return 'bg-amber-500/10 text-amber-500 border-amber-500/50';
      case 'LOW': return 'bg-green-500/10 text-green-500 border-green-500/50';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getRecColor = (rec: string) => {
    if (rec.includes('EXECUTE')) return 'text-green-500';
    if (rec.includes('VETO')) return 'text-red-500';
    return 'text-foreground';
  };

  if (isLoading && gridItems.length === 0) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  return (
    <div className="border rounded-md bg-card/30 overflow-hidden backdrop-blur-sm">
      <Table>
        <TableHeader className="bg-muted/50 font-mono text-xs uppercase tracking-wider">
          <TableRow>
            <TableHead>Fixture</TableHead>
            <TableHead className="text-right">Spread</TableHead>
            <TableHead className="text-right">Latency</TableHead>
            <TableHead>Vol Risk</TableHead>
            <TableHead>Sentinel</TableHead>
            <TableHead className="text-right">Edge Score</TableHead>
            <TableHead>Recommendation</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="font-mono text-sm">
          {gridItems.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                No active fixtures tracked
              </TableCell>
            </TableRow>
          ) : (
            gridItems.map((item) => {
              const workerRisk = getFixtureRisk(item.fixtureId);
              const usingWorker = workerLive && workerRisk != null;

              // Prefer live worker data over server data where available
              const displayEdge = usingWorker ? workerRisk.edgeScore : item.edgeScore;
              const displayRec  = usingWorker ? workerRisk.recommendation : item.recommendation;
              const displayLatMs = usingWorker ? workerRisk.latencyMs : item.latencyMs;

              const sentinelSig = workerRisk?.signals.find(s => s.agentName === 'Sentinel');
              const displaySentinel = sentinelSig ? sentinelSig.signalType : item.sentinelStatus;

              const volSig = workerRisk?.signals.find(s => s.agentName === 'Volatility');
              const displayVolRisk = volSig
                ? volSig.signalType === 'HIGH_VOLATILITY' ? 'CRITICAL'
                : volSig.signalType === 'ELEVATED_VOL'   ? 'HIGH'
                : volSig.signalType === 'LOW_VOLATILITY'  ? 'LOW'
                : item.volatilityRisk
                : item.volatilityRisk;

              return (
                <TableRow key={item.fixtureId} className="hover:bg-muted/30 transition-colors group">
                  <TableCell>
                    <Link href={`/dashboard/matches/${item.fixtureId}`}>
                      <div className="font-bold cursor-pointer group-hover:text-primary transition-colors">
                        {item.homeTeam} vs {item.awayTeam}
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-medium">{item.spread.toFixed(2)}</TableCell>
                  <TableCell className={`text-right ${displayLatMs > 200 ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {displayLatMs}ms
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] uppercase rounded-sm ${getRiskColor(displayVolRisk)}`}>
                      {displayVolRisk}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs ${displaySentinel === 'ALERT' || displaySentinel === 'TOXIC_FLOW' || displaySentinel === 'CIRCUIT_BREAKER' ? 'text-destructive font-bold animate-pulse' : 'text-muted-foreground'}`}>
                      {displaySentinel}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={`font-bold cursor-help ${usingWorker ? 'text-cyan-400' : 'text-primary'} flex items-center justify-end gap-1`}>
                          {usingWorker && <Zap className="w-3 h-3 text-cyan-400" />}
                          {displayEdge.toFixed(1)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="font-mono text-xs">
                        {usingWorker
                          ? `Worker-computed · consensus ${(workerRisk.signals.find(s => s.agentName === 'Orchestrator')?.payload?.consensus as string) ?? '—'}`
                          : 'Server-side score'}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className={`font-bold ${getRecColor(displayRec)}`}>
                    {displayRec}
                    {usingWorker && <span className="text-[9px] text-cyan-400/70 ml-1">[W]</span>}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
