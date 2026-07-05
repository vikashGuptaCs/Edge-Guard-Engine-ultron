import React from "react";
import { OddsSnapshot } from "@workspace/api-client-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  ComposedChart
} from "recharts";
import { format } from "date-fns";

interface OddsLadderProps {
  data: OddsSnapshot[];
  currentMinute?: number;
}

export function OddsLadder({ data, currentMinute }: OddsLadderProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center border rounded-lg bg-card/30 text-muted-foreground font-mono text-sm">
        No odds data available for this timeline.
      </div>
    );
  }

  // Transform data for recharts
  const chartData = data.map(d => ({
    time: d.ts,
    formattedTime: format(new Date(d.ts), "HH:mm:ss"),
    price: d.stablePrice,
    upperBand: d.stablePrice + (d.spread / 2),
    lowerBand: d.stablePrice - (d.spread / 2),
    volume: d.volume
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card/90 border backdrop-blur-md p-3 rounded-lg shadow-xl font-mono text-xs">
          <p className="text-muted-foreground mb-1">{payload[0].payload.formattedTime}</p>
          <p className="font-bold text-primary">Price: {payload[0].payload.price.toFixed(3)}</p>
          <p className="text-muted-foreground">Spread: {(payload[0].payload.upperBand - payload[0].payload.lowerBand).toFixed(3)}</p>
          <p className="text-accent mt-1">Vol: {payload[0].payload.volume.toLocaleString()}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-[400px] w-full bg-card/30 border rounded-lg p-4">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="spreadGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis 
            dataKey="formattedTime" 
            stroke="hsl(var(--muted-foreground))" 
            fontSize={10} 
            tickMargin={10}
            minTickGap={30}
          />
          <YAxis 
            stroke="hsl(var(--muted-foreground))" 
            fontSize={10} 
            domain={['auto', 'auto']}
            tickFormatter={(val) => val.toFixed(2)}
          />
          <Tooltip content={<CustomTooltip />} />
          
          <Area 
            type="stepAfter" 
            dataKey="upperBand" 
            stroke="none" 
            fill="url(#spreadGradient)" 
          />
          <Area 
            type="stepAfter" 
            dataKey="lowerBand" 
            stroke="none" 
            fill="hsl(var(--background))" 
          />
          
          <Line 
            type="stepAfter" 
            dataKey="price" 
            stroke="hsl(var(--primary))" 
            strokeWidth={2} 
            dot={false}
            activeDot={{ r: 4, fill: "hsl(var(--background))", stroke: "hsl(var(--primary))", strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
