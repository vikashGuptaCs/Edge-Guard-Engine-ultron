import React from "react";
import { useWallet } from "@/hooks/use-wallet";
import { useAutopilot } from "@/hooks/use-autopilot";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Moon, Sun, Monitor, AlertTriangle, ShieldAlert } from "lucide-react";
import { KillSwitch } from "../dashboard/KillSwitch";
import { useHealthCheck } from "@workspace/api-client-react";

export function TopBar() {
  const { connected, publicKey, source, network, disconnect } = useWallet();
  const { theme, setTheme } = useTheme();
  const { hardLocked } = useAutopilot();
  
  const { data: health } = useHealthCheck({
    query: { refetchInterval: 30000 }
  });

  const truncateAddress = (addr: string) =>
    addr.length > 8 ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : addr;

  const walletLabel = connected && publicKey
    ? source === 'phantom'
      ? `PHANTOM • ${truncateAddress(publicKey)}`
      : `READ-ONLY • ${truncateAddress(publicKey)}`
    : null;

  return (
    <header className={`h-14 border-b flex items-center justify-between px-4 sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 transition-colors ${hardLocked ? 'border-destructive/50 shadow-[0_0_15px_rgba(255,0,0,0.2)]' : 'border-border'}`}>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-primary font-bold text-lg tracking-tight font-mono">
          <ShieldAlert className="w-5 h-5" />
          <span>EDGEGUARD_v3</span>
        </div>
        <Badge variant={network === "mainnet" ? "default" : "secondary"} className="font-mono text-xs">
          {network.toUpperCase()}
        </Badge>
        <div className="flex items-center gap-1.5 ml-2">
          <div className={`w-2 h-2 rounded-full ${health?.status === 'ok' ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
          <span className="text-[10px] text-muted-foreground font-mono uppercase">API {health?.status || 'Unknown'}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <KillSwitch />

        <div className="flex items-center bg-muted rounded-full p-1 border">
          <Button
            variant="ghost"
            size="icon"
            className={`w-7 h-7 rounded-full ${theme === "light" ? "bg-background shadow-sm" : ""}`}
            onClick={() => setTheme("light")}
          >
            <Sun className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`w-7 h-7 rounded-full ${theme === "dark" ? "bg-background shadow-sm" : ""}`}
            onClick={() => setTheme("dark")}
          >
            <Moon className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`w-7 h-7 rounded-full ${theme === "system" ? "bg-background shadow-sm" : ""}`}
            onClick={() => setTheme("system")}
          >
            <Monitor className="w-4 h-4" />
          </Button>
        </div>

        {connected && publicKey ? (
          <div className="flex items-center gap-2 bg-card border rounded-md px-3 py-1.5 text-sm font-mono">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="font-semibold text-foreground">{walletLabel}</span>
            <Button variant="ghost" size="sm" className="h-auto p-0 ml-2 text-muted-foreground hover:text-foreground" onClick={disconnect}>
              Disconnect
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="font-mono text-xs">
            Not Connected
          </Button>
        )}
      </div>
    </header>
  );
}
