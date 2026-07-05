import React from 'react';
import { useRiskAgentContext } from '@/contexts/RiskAgentContext';
import { Cpu } from 'lucide-react';

export function WorkerStatusBadge() {
  const { workerStatus, monitoredFixtureCount } = useRiskAgentContext();

  const label: Record<string, string> = {
    idle:     'WORKERS IDLE',
    starting: 'WORKERS INIT',
    running:  monitoredFixtureCount > 0
                ? `WORKERS LIVE · ${monitoredFixtureCount} FIX`
                : 'WORKERS LIVE',
    error:    'WORKER ERROR',
  };

  const color: Record<string, string> = {
    idle:     'text-muted-foreground',
    starting: 'text-amber-400',
    running:  'text-cyan-400',
    error:    'text-red-500',
  };

  const dotColor: Record<string, string> = {
    idle:     'bg-muted-foreground',
    starting: 'bg-amber-400',
    running:  'bg-cyan-400 animate-pulse shadow-[0_0_6px_rgba(34,211,238,0.7)]',
    error:    'bg-red-500 animate-pulse',
  };

  return (
    <div className={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider ${color[workerStatus]}`}>
      <Cpu className="w-3 h-3" />
      <div className={`w-1.5 h-1.5 rounded-full ${dotColor[workerStatus]}`} />
      <span>{label[workerStatus] ?? 'WORKERS IDLE'}</span>
    </div>
  );
}
