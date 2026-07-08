import React from "react";
import { useAutopilot } from "@/hooks/use-autopilot";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Unlock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function KillSwitch() {
  const { hardLocked, setHardLocked } = useAutopilot();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={hardLocked ? "destructive" : "outline"}
          size="sm"
          className={`font-mono text-xs uppercase tracking-wider font-bold transition-all ${
            hardLocked 
              ? "animate-pulse shadow-[0_0_10px_rgba(255,0,0,0.5)] border-red-500" 
              : "border-border hover:border-red-500/50 hover:text-red-500"
          }`}
          onClick={() => setHardLocked(!hardLocked)}
        >
          {hardLocked ? (
            <>
              <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />
              Locked
            </>
          ) : (
            <>
              <Unlock className="w-3.5 h-3.5 mr-1.5" />
              Armed
            </>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="font-mono text-xs">
        {hardLocked ? "Disable Kill Switch (Return to read-only controls)" : "Engage Kill Switch (Block all submission authority)"}
      </TooltipContent>
    </Tooltip>
  );
}
