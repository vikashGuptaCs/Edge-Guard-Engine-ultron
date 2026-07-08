import React from "react";
import { getGetLiveTickerQueryKey, useGetLiveTicker } from "@workspace/api-client-react";
import { Link } from "wouter";

export function LiveTicker() {
  const { data: tickerItems = [], isLoading } = useGetLiveTicker({
    query: {
      queryKey: getGetLiveTickerQueryKey(),
      refetchInterval: 5000,
    }
  });

  if (isLoading && tickerItems.length === 0) {
    return (
      <div className="h-10 bg-card/50 border-b flex items-center px-4 overflow-hidden">
        <div className="animate-pulse flex gap-8">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-4 w-48 bg-muted rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (tickerItems.length === 0) {
    return (
      <div className="h-10 bg-card/50 border-b border-t flex items-center px-4 text-xs font-mono text-muted-foreground">
        No live ticker entries available right now.
      </div>
    );
  }

  return (
    <div className="h-10 bg-card/50 border-b border-t flex items-center overflow-hidden relative group">
      <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background to-transparent z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent z-10" />
      
      <div className="flex animate-[ticker_30s_linear_infinite] group-hover:[animation-play-state:paused] whitespace-nowrap items-center font-mono text-xs">
        {/* Duplicate items for infinite scroll effect */}
        {[...tickerItems, ...tickerItems, ...tickerItems].map((item, idx) => {
          const actionColor = 
            item.action === 'EXECUTE' ? 'text-green-500 bg-green-500/10' : 
            item.action === 'VETO' ? 'text-red-500 bg-red-500/10' : 
            'text-amber-500 bg-amber-500/10';

          return (
            <Link key={`${item.fixtureId}-${idx}`} href={`/dashboard/matches/${item.fixtureId}`}>
              <div className="flex items-center gap-3 px-6 border-r border-border/50 cursor-pointer hover:bg-muted/50 transition-colors py-1">
                <span className="font-bold text-foreground">
                  {item.homeTeam} {item.homeScore}-{item.awayScore} {item.awayTeam}
                </span>
                <span className="text-muted-foreground">{item.minutePlayed}'</span>
                <span className="text-primary font-bold">{item.edgeScore.toFixed(1)} EDGE</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] tracking-widest font-bold ${actionColor}`}>
                  {item.action}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
