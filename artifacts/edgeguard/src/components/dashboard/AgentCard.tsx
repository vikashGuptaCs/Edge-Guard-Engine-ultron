import React from "react";
import { AgentHeartbeat } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatDistanceToNow } from "date-fns";

interface AgentCardProps {
  agent: AgentHeartbeat;
}

export function AgentCard({ agent }: AgentCardProps) {
  const statusColors = {
    ACTIVE: "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]",
    PAUSED: "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]",
    ALERT: "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]",
  };

  const statusColor = statusColors[agent.status as keyof typeof statusColors] || statusColors.ACTIVE;
  
  // Mock confidence for UI based on status
  const confidence = agent.status === 'ACTIVE' ? 85 + Math.random() * 10 : 
                     agent.status === 'PAUSED' ? 40 + Math.random() * 20 : 
                     10 + Math.random() * 10;

  return (
    <Card className="bg-card/40 backdrop-blur-md border-border/50 hover:border-primary/50 transition-all group overflow-hidden relative">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity" />
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-mono tracking-tight font-medium flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${statusColor} ${agent.status === 'ACTIVE' ? 'animate-pulse' : ''}`} />
          {agent.agentName}
        </CardTitle>
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
          {agent.status}
        </span>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-end">
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground font-mono uppercase">Verdict</span>
              <span className={`text-xs font-mono font-bold ${
                agent.verdict === 'EXECUTE' ? 'text-green-500' : 
                agent.verdict === 'VETO' ? 'text-red-500' : 'text-foreground'
              }`}>
                {agent.verdict || "MONITORING"}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-muted-foreground font-mono uppercase">Active Fixtures</span>
              <span className="text-xs font-mono">{agent.activeFixtures}</span>
            </div>
          </div>
          
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] font-mono">
              <span className="text-muted-foreground">Confidence</span>
              <span>{confidence.toFixed(1)}%</span>
            </div>
            <Progress value={confidence} className="h-1.5" />
          </div>
          
          <div className="text-[10px] text-muted-foreground font-mono text-right mt-1">
            Last signal: {agent.lastSignalTs ? formatDistanceToNow(agent.lastSignalTs, { addSuffix: true }) : 'Never'}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
