import React, { useState } from "react";
import { useListAlerts, useNarrateAlert } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BellRing, ExternalLink, MessageSquareText } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export default function AlertsPage() {
  const { data: alerts = [], isLoading } = useListAlerts({ limit: 100 }, {
    query: { refetchInterval: 10000 }
  });
  
  const narrateMutation = useNarrateAlert();
  const [selectedAlert, setSelectedAlert] = useState<any>(null);
  const [narration, setNarration] = useState<string | null>(null);

  const handleNarrate = (alert: any) => {
    setSelectedAlert(alert);
    setNarration(null);
    narrateMutation.mutate({
      data: {
        alertId: alert.id,
        fixtureId: alert.fixtureId,
        edgeScore: alert.edgeScore,
        action: alert.action,
        context: { narration: alert.narration }
      }
    }, {
      onSuccess: (data) => {
        setNarration(data.narration);
      }
    });
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
          <BellRing className="w-6 h-6 text-primary" />
          ALERT_HISTORY
        </h1>
        <p className="text-sm font-mono text-muted-foreground">Historical log of all execution and veto events triggered by the ensemble.</p>
      </div>

      <div className="border rounded-md bg-card/30 overflow-hidden flex-1">
        <Table>
          <TableHeader className="bg-muted/50 font-mono text-xs uppercase tracking-wider">
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Fixture</TableHead>
              <TableHead>Action</TableHead>
              <TableHead className="text-right">Edge Score</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="font-mono text-sm">
            {isLoading && alerts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="p-0">
                  <div className="space-y-1 p-2">
                    {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                  </div>
                </TableCell>
              </TableRow>
            ) : alerts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground font-mono">No alerts recorded.</TableCell>
              </TableRow>
            ) : (
              alerts.map((alert) => (
                <TableRow key={alert.id} className="hover:bg-muted/30">
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {format(new Date(alert.ts), "MM/dd HH:mm:ss")}
                  </TableCell>
                  <TableCell>
                    <Link href={`/dashboard/matches/${alert.fixtureId}`}>
                      <span className="font-bold cursor-pointer hover:text-primary transition-colors flex items-center gap-1">
                        {alert.fixture ? `${alert.fixture.homeTeam} vs ${alert.fixture.awayTeam}` : `Fixture #${alert.fixtureId}`}
                        <ExternalLink className="w-3 h-3 text-muted-foreground" />
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline" 
                      className={`text-[10px] tracking-wider rounded-sm ${
                        alert.action.includes('EXECUTE') ? 'bg-green-500/10 text-green-500 border-green-500/50' :
                        alert.action.includes('VETO') ? 'bg-red-500/10 text-red-500 border-red-500/50' : ''
                      }`}
                    >
                      {alert.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-bold text-primary">
                    {alert.edgeScore.toFixed(1)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs max-w-[200px] truncate" title={alert.narration || ""}>
                        {alert.narration || "-"}
                      </span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={() => handleNarrate(alert)}>
                        <MessageSquareText className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      
      <Dialog open={!!selectedAlert} onOpenChange={(open) => !open && setSelectedAlert(null)}>
        <DialogContent className="font-mono bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary uppercase tracking-widest">
              <MessageSquareText className="w-5 h-5" /> AI Narration
            </DialogTitle>
            <DialogDescription>
              Detailed analysis of Alert #{selectedAlert?.id} for Fixture #{selectedAlert?.fixtureId}
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 bg-muted/30 rounded-md border text-sm text-foreground mt-4 min-h-[100px]">
            {narrateMutation.isPending ? (
              <div className="flex items-center justify-center h-full text-muted-foreground animate-pulse">
                Generating analysis...
              </div>
            ) : narration ? (
              <p className="whitespace-pre-wrap leading-relaxed">{narration}</p>
            ) : (
              <p className="text-muted-foreground">Failed to generate narration.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
