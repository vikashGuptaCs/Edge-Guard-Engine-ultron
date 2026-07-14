import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { useGetFixture, useGetFixtureTimeline, getGetFixtureQueryKey, getGetFixtureTimelineQueryKey } from "@workspace/api-client-react";
import { TimelineReplaySlider } from "@/components/dashboard/TimelineReplaySlider";
import { OddsLadder } from "@/components/dashboard/OddsLadder";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, ShieldAlert, Cpu } from "lucide-react";
import { format } from "date-fns";
import { useAutopilot } from "@/hooks/use-autopilot";

export default function MatchDetailPage() {
  const params = useParams();
  const fixtureId = parseInt(params.fixtureId || "0", 10);
  const { hardLocked } = useAutopilot();

  const { data: fixture, isLoading: isLoadingFixture } = useGetFixture(fixtureId, {
    query: { enabled: !!fixtureId, queryKey: getGetFixtureQueryKey(fixtureId), refetchInterval: 3000 }
  });

  const { data: timeline, isLoading: isLoadingTimeline } = useGetFixtureTimeline(fixtureId, {
    query: { enabled: !!fixtureId, queryKey: getGetFixtureTimelineQueryKey(fixtureId), refetchInterval: 3000 }
  });

  const [currentMinute, setCurrentMinute] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasUserScrubbed, setHasUserScrubbed] = useState(false);

  // Sync to live minute initially, or when live updates push it forward —
  // but only until the user manually scrubs the slider.
  useEffect(() => {
    if (fixture?.minutePlayed != null && !isPlaying && !hasUserScrubbed) {
      setCurrentMinute(fixture.minutePlayed);
    }
  }, [fixture?.minutePlayed, isPlaying, hasUserScrubbed]);

  // Handle playback
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPlaying && fixture?.minutePlayed != null) {
      interval = setInterval(() => {
        setCurrentMinute(prev => {
          if (prev >= (fixture.minutePlayed ?? 90)) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1000); // 1 real second = 1 match minute in replay
    }
    return () => clearInterval(interval);
  }, [isPlaying, fixture?.minutePlayed]);

  const handleScrub = useCallback((minute: number) => {
    setHasUserScrubbed(true);
    setCurrentMinute(minute);
  }, []);

  const jumpToLive = useCallback(() => {
    setHasUserScrubbed(false);
    if (fixture?.minutePlayed != null) setCurrentMinute(fixture.minutePlayed);
  }, [fixture?.minutePlayed]);

  if (isLoadingFixture || isLoadingTimeline) {
    return <div className="p-6 space-y-6"><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!fixture || !timeline) {
    return <div className="p-6 text-center text-muted-foreground font-mono">Fixture data not found.</div>;
  }

  function pickPrimaryMarketOdds(odds: typeof timeline.odds): typeof timeline.odds {
    const groups = new Map<string, typeof timeline.odds>();
    for (const o of odds) {
      const key = `${o.market}:${o.selection}`;
      const arr = groups.get(key) ?? [];
      arr.push(o);
      groups.set(key, arr);
    }
    let best: typeof timeline.odds = [];
    for (const arr of groups.values()) {
      if (arr.length > best.length) best = arr;
    }
    return best;
  }

  const minutesElapsedSince = (fixture.minutePlayed ?? 0) - currentMinute;
  const replayThreshold = Date.now() - minutesElapsedSince * 60000;
  const currentOdds = pickPrimaryMarketOdds(
    timeline.odds.filter(o => o.ts <= replayThreshold),
  );
  const currentSignals = timeline.signals.filter(s => new Date(s.ts).getTime() <= replayThreshold);

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tight flex items-center gap-3">
            {fixture.homeTeam} 
            <span className="text-primary">{fixture.homeScore ?? 0}</span> 
            <span className="text-muted-foreground text-xl">-</span> 
            <span className="text-primary">{fixture.awayScore ?? 0}</span> 
            {fixture.awayTeam}
          </h1>
          <div className="flex items-center gap-3 mt-2 font-mono text-sm">
            <Badge variant="outline">{fixture.competition}</Badge>
            <span className="text-muted-foreground">Kickoff: {format(new Date(fixture.kickoffTs), "HH:mm")}</span>
            <span className={`font-bold ${fixture.feedLatencyMs != null && fixture.feedLatencyMs > 200 ? 'text-destructive' : 'text-green-500'}`}>
              Latency: {fixture.feedLatencyMs != null ? `${fixture.feedLatencyMs}ms` : '—'}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 bg-card border rounded-lg p-3">
          <span className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider">Edge Score</span>
          <span className="text-3xl font-bold font-mono text-primary">{fixture.currentEdgeScore != null ? fixture.currentEdgeScore.toFixed(1) : "0.0"}</span>
        </div>
      </div>

      {hardLocked && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-xs font-mono text-red-400 flex items-center gap-2">
          <ShieldAlert className="w-3.5 h-3.5" /> Hard lock enabled — trading disabled
        </div>
      )}

      <TimelineReplaySlider 
        currentMinute={currentMinute} 
        maxMinute={fixture.minutePlayed ?? 90} 
        onChange={handleScrub}
        isPlaying={isPlaying}
        onPlayPause={() => setIsPlaying(!isPlaying)}
      />
      {hasUserScrubbed && !isPlaying && (
        <button className="text-xs text-primary underline mt-2" onClick={jumpToLive}>Jump to live minute</button>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="col-span-1 lg:col-span-2 flex flex-col gap-4">
          <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Activity className="w-4 h-4" /> Market Odds Ladder (Spread Band)
          </h3>
          <OddsLadder data={currentOdds} currentMinute={currentMinute} />
        </div>

        <div className="flex flex-col gap-4">
          <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Cpu className="w-4 h-4" /> Agent Signals Log
          </h3>
          <div className="border bg-card/30 rounded-lg p-0 overflow-hidden flex flex-col h-[400px]">
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {currentSignals.length === 0 ? (
                <div className="text-center text-muted-foreground text-xs font-mono mt-10">No agent signals recorded yet.</div>
              ) : (
                [...currentSignals].reverse().slice(0, 50).map(signal => (
                  <div key={signal.id} className="border-b border-border/50 pb-3 last:border-0 last:pb-0">
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-primary">{signal.agentName}</span>
                        <Badge variant="outline" className={`text-[9px] h-4 uppercase ${
                          signal.signalType.includes('VETO') || signal.signalType === 'CIRCUIT_BREAKER' ? 'text-red-500 border-red-500/50' : 
                          signal.signalType.includes('EXECUTE') ? 'text-green-500 border-green-500/50' : 
                          'text-amber-500 border-amber-500/50'
                        }`}>
                          {signal.signalType}
                        </Badge>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {format(new Date(signal.ts), "HH:mm:ss")}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] font-mono">
                      <span className="text-muted-foreground opacity-80 truncate max-w-[200px]">
                        {JSON.stringify(signal.payload)}
                      </span>
                      <span className="font-bold">Conf: {(signal.confidence * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
