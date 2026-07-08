import React, { useState } from "react";
import { useLocation } from "wouter";
import { useWallet } from "@/hooks/use-wallet";
import { useAutopilot } from "@/hooks/use-autopilot";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Moon,
  Sun,
  Monitor,
  ShieldAlert,
  Wallet2,
  CircleSlash,
  AlertCircle,
  RefreshCw,
  LogOut,
  Network,
  Zap,
} from "lucide-react";
import { KillSwitch } from "../dashboard/KillSwitch";
import { getHealthCheckQueryKey, useHealthCheck } from "@workspace/api-client-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function TopBar() {
  const [, setLocation] = useLocation();
  const { connected, publicKey, source, network, disconnect, connectionState, error, reconnect, setNetwork } = useWallet();
  const { theme, setTheme } = useTheme();
  const { hardLocked } = useAutopilot();
  const [isNetworkMenuOpen, setIsNetworkMenuOpen] = useState(false);

  const { data: health } = useHealthCheck({
    query: {
      queryKey: getHealthCheckQueryKey(),
      refetchInterval: 30000,
    },
  });

  const truncateAddress = (addr: string) =>
    addr.length > 8 ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : addr;

  const walletLabel = connected && publicKey
    ? source === "phantom"
      ? `PHANTOM • ${truncateAddress(publicKey)}`
      : `VIEWER • ${truncateAddress(publicKey)}`
    : null;

  const isConnecting = connectionState === "connecting" || connectionState === "reconnecting";
  const isError = connectionState === "error" || error;

  return (
    <header
      className={`h-16 border-b flex items-center justify-between px-6 sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 transition-all duration-300 ${
        hardLocked
          ? "border-destructive/50 shadow-[0_0_15px_rgba(255,0,0,0.2)]"
          : isError
          ? "border-destructive/30 shadow-[0_0_10px_rgba(255,0,0,0.1)]"
          : "border-border"
      }`}
    >
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-primary font-bold text-lg tracking-tight font-mono">
          <ShieldAlert className="w-5 h-5" />
          <span>EDGEGUARD_v3</span>
        </div>

        {/* Network Selector */}
        <DropdownMenu open={isNetworkMenuOpen} onOpenChange={setIsNetworkMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Badge
              variant={network === "mainnet" ? "default" : "secondary"}
              className="font-mono text-xs cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-1.5 px-3 py-1"
            >
              <Network className="w-3 h-3" />
              {network.toUpperCase()}
            </Badge>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel className="text-xs font-mono">Select Network</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => {
                  setNetwork("devnet");
                  setIsNetworkMenuOpen(false);
                }}
                className={`font-mono text-xs cursor-pointer ${network === "devnet" ? "bg-muted" : ""}`}
              >
                <div className="flex items-center gap-2 w-full">
                  <div className={`w-2 h-2 rounded-full ${network === "devnet" ? "bg-primary" : "bg-muted-foreground"}`} />
                  <span>Solana Devnet</span>
                  {network === "devnet" && <Zap className="w-3 h-3 ml-auto text-primary" />}
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setNetwork("mainnet");
                  setIsNetworkMenuOpen(false);
                }}
                className={`font-mono text-xs cursor-pointer ${network === "mainnet" ? "bg-muted" : ""}`}
              >
                <div className="flex items-center gap-2 w-full">
                  <div
                    className={`w-2 h-2 rounded-full ${network === "mainnet" ? "bg-amber-500" : "bg-muted-foreground"}`}
                  />
                  <span>Solana Mainnet</span>
                  {network === "mainnet" && <Zap className="w-3 h-3 ml-auto text-amber-500" />}
                </div>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Health Check */}
        <div className="flex items-center gap-1.5 ml-2 px-2 py-1 rounded-md bg-muted/50 border border-border/50">
          <div
            className={`w-2 h-2 rounded-full transition-all ${
              health?.status === "ok" ? "bg-green-500" : "bg-red-500 animate-pulse"
            }`}
          />
          <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
            API {health?.status || "Checking"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <KillSwitch />

        {/* Theme Selector */}
        <div className="flex items-center bg-muted rounded-full p-1 border border-border/50">
          <Button
            variant="ghost"
            size="icon"
            className={`w-7 h-7 rounded-full transition-all ${theme === "light" ? "bg-background shadow-sm" : ""}`}
            onClick={() => setTheme("light")}
            title="Light theme"
          >
            <Sun className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`w-7 h-7 rounded-full transition-all ${theme === "dark" ? "bg-background shadow-sm" : ""}`}
            onClick={() => setTheme("dark")}
            title="Dark theme"
          >
            <Moon className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`w-7 h-7 rounded-full transition-all ${theme === "system" ? "bg-background shadow-sm" : ""}`}
            onClick={() => setTheme("system")}
            title="System theme"
          >
            <Monitor className="w-4 h-4" />
          </Button>
        </div>

        {/* Wallet Status Section */}
        {connected && publicKey ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={`font-mono text-xs h-auto px-3 py-2 rounded-full border transition-all duration-200 cursor-pointer group ${
                  isError
                    ? "border-destructive/50 hover:border-destructive hover:bg-destructive/10"
                    : "bg-card/80 hover:bg-card border-border/70"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`flex h-5 w-5 items-center justify-center rounded-full text-sm font-semibold ${
                    isError
                      ? "bg-destructive/20 text-destructive"
                      : "bg-emerald-500/10 text-emerald-500"
                  }`}>
                    {isConnecting ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : isError ? (
                      <AlertCircle className="h-3 w-3" />
                    ) : (
                      <Wallet2 className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <span className="max-w-[150px] truncate">{walletLabel}</span>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs font-mono">Wallet</DropdownMenuLabel>
              <DropdownMenuSeparator />

              {/* Wallet Info */}
              <div className="px-3 py-2 bg-muted/50 rounded-md mb-2 text-xs font-mono space-y-1">
                <div className="text-muted-foreground">
                  <span className="text-foreground font-semibold">Type:</span> {source === "phantom" ? "Phantom Wallet" : "Read-Only Viewer"}
                </div>
                <div className="text-muted-foreground break-all">
                  <span className="text-foreground font-semibold">Address:</span> {publicKey}
                </div>
                <div className="text-muted-foreground">
                  <span className="text-foreground font-semibold">Network:</span> {network === "devnet" ? "Devnet" : "Mainnet"}
                </div>
              </div>

              <DropdownMenuSeparator />

              {/* Actions */}
              <DropdownMenuGroup>
                {isError && (
                  <DropdownMenuItem
                    onClick={() => void reconnect()}
                    className="text-xs font-mono cursor-pointer text-amber-500 hover:text-amber-600 hover:bg-amber-500/10"
                  >
                    <RefreshCw className="w-3 h-3 mr-2" />
                    Reconnect Wallet
                  </DropdownMenuItem>
                )}

                <DropdownMenuItem
                  onClick={() => void disconnect()}
                  className="text-xs font-mono cursor-pointer text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="w-3 h-3 mr-2" />
                  Disconnect Wallet
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="font-mono text-xs transition-all duration-200 hover:bg-primary/10 hover:text-primary"
            onClick={() => setLocation("/auth")}
          >
            {isConnecting ? (
              <>
                <RefreshCw className="w-3 h-3 mr-2 animate-spin" />
                Connecting
              </>
            ) : (
              <>
                <Wallet2 className="w-3 h-3 mr-2" />
                Connect Wallet
              </>
            )}
          </Button>
        )}
      </div>
    </header>
  );
}
