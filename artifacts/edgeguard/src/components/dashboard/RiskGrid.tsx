import React from "react";
import { useGetRiskGrid } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

export function RiskGrid() {
  const { data: gridItems = [], isLoading } = useGetRiskGrid({
    query: { refetchInterval: 5000 }
  });

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
            gridItems.map((item) => (
              <TableRow key={item.fixtureId} className="hover:bg-muted/30 transition-colors group">
                <TableCell>
                  <Link href={`/dashboard/matches/${item.fixtureId}`}>
                    <div className="font-bold cursor-pointer group-hover:text-primary transition-colors">
                      {item.homeTeam} vs {item.awayTeam}
                    </div>
                  </Link>
                </TableCell>
                <TableCell className="text-right font-medium">{item.spread.toFixed(2)}</TableCell>
                <TableCell className={`text-right ${item.latencyMs > 200 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {item.latencyMs}ms
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] uppercase rounded-sm ${getRiskColor(item.volatilityRisk)}`}>
                    {item.volatilityRisk}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className={`text-xs ${item.sentinelStatus === 'ALERT' ? 'text-destructive font-bold animate-pulse' : 'text-muted-foreground'}`}>
                    {item.sentinelStatus}
                  </span>
                </TableCell>
                <TableCell className="text-right font-bold text-primary">
                  {item.edgeScore.toFixed(1)}
                </TableCell>
                <TableCell className={`font-bold ${getRecColor(item.recommendation)}`}>
                  {item.recommendation}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
