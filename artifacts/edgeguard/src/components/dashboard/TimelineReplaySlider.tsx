import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TimelineReplaySliderProps {
  currentMinute: number;
  maxMinute: number;
  onChange: (minute: number) => void;
  isPlaying?: boolean;
  onPlayPause?: () => void;
}

export function TimelineReplaySlider({ 
  currentMinute, 
  maxMinute, 
  onChange,
  isPlaying = false,
  onPlayPause
}: TimelineReplaySliderProps) {
  return (
    <div className="bg-card/40 border rounded-lg p-4 backdrop-blur-md">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center font-mono text-sm">
          <span className="text-muted-foreground">0'</span>
          <span className="font-bold text-primary text-lg">{currentMinute}'</span>
          <span className="text-muted-foreground">{maxMinute}'</span>
        </div>
        
        <div className="relative pt-2 pb-6 px-2">
          <Slider
            value={[currentMinute]}
            min={0}
            max={maxMinute}
            step={1}
            onValueChange={(val) => onChange(val[0])}
            className="cursor-pointer"
          />
          {/* Thumb marker decoration */}
          <motion.div 
            className="absolute top-0 bottom-0 pointer-events-none"
            initial={false}
            animate={{ left: `calc(${(currentMinute / maxMinute) * 100}% - 1px)` }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <div className="w-[2px] h-full bg-primary/50 relative">
              <div className="absolute top-0 -left-[3px] w-2 h-2 rounded-full bg-primary" />
              <div className="absolute bottom-0 -left-[3px] w-2 h-2 rounded-full bg-primary" />
            </div>
          </motion.div>
        </div>

        <div className="flex justify-center items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => onChange(Math.max(0, currentMinute - 5))}>
            <SkipBack className="w-4 h-4" />
          </Button>
          <Button variant={isPlaying ? "destructive" : "default"} size="icon" onClick={onPlayPause}>
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>
          <Button variant="outline" size="icon" onClick={() => onChange(Math.min(maxMinute, currentMinute + 5))}>
            <SkipForward className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
