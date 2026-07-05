import React from "react";
import { useAutopilot } from "@/hooks/use-autopilot";
import { useWallet } from "@/hooks/use-wallet";
import { Settings, ShieldAlert, Zap, Globe, Cpu, Link as LinkIcon, CheckCircle2, XCircle, Loader2, RefreshCw, Wifi } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGetTxlineStatus, useGetTxlineFixtures } from "@workspace/api-client-react";

export default function SettingsPage() {
  const { enabled, threshold, hardLocked, setEnabled, setThreshold, setHardLocked } = useAutopilot();
  const { network, setNetwork } = useWallet();

  const { data: txlineStatus, isLoading: statusLoading, refetch: refetchStatus } = useGetTxlineStatus({
    query: { refetchInterval: 30_000 },
  });

  const { data: txlineFixtures, isLoading: fixturesLoading } = useGetTxlineFixtures({
    query: {
      enabled: txlineStatus?.connected === true,
      refetchInterval: 60_000,
    },
  });

  const isConnected = txlineStatus?.connected;
  const fixtureCount = txlineFixtures?.length ?? txlineStatus?.fixtureCount ?? 0;

  return (
    <div className="flex flex-col gap-6 h-full max-w-4xl pb-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
          <Settings className="w-6 h-6 text-primary" />
          SYSTEM_PARAMS
        </h1>
        <p className="text-sm font-mono text-muted-foreground">Configure autopilot thresholds, risk tolerance, and network settings.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-card/40 border-border/50">
          <CardHeader>
            <CardTitle className="font-mono text-sm uppercase flex items-center gap-2">
              <Cpu className="w-4 h-4 text-primary" /> Autopilot Config
            </CardTitle>
            <CardDescription className="font-mono text-xs">Automated execution settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="font-mono">Enable Autopilot</Label>
                <div className="text-xs text-muted-foreground font-mono">Allow agents to execute trades</div>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={setEnabled}
                disabled={hardLocked}
                className="data-[state=checked]:bg-primary"
              />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="font-mono">Execution Edge Threshold</Label>
                <span className="font-mono text-primary font-bold">{threshold}</span>
              </div>
              <Slider
                value={[threshold]}
                onValueChange={(v) => setThreshold(v[0])}
                max={100}
                min={50}
                step={1}
                disabled={hardLocked}
              />
              <p className="text-xs text-muted-foreground font-mono">Minimum edge score required to trigger an execution signal.</p>
            </div>

            <div className="space-y-3 pt-4 border-t border-border/50">
              <Label className="font-mono">Slippage Tolerance (%)</Label>
              <div className="flex items-center gap-2">
                <Input type="number" defaultValue={2.5} className="font-mono w-24 bg-background" disabled={hardLocked} />
                <span className="text-muted-foreground font-mono text-sm">%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/40 border-border/50">
          <CardHeader>
            <CardTitle className="font-mono text-sm uppercase flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-destructive" /> Hardware Kill Switch
            </CardTitle>
            <CardDescription className="font-mono text-xs">Emergency overrides</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-destructive/10 border border-destructive/30 rounded-md p-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="font-mono text-destructive font-bold uppercase tracking-wider">Master Lock</Label>
                <Switch
                  checked={hardLocked}
                  onCheckedChange={setHardLocked}
                  className="data-[state=checked]:bg-destructive"
                />
              </div>
              <p className="text-xs text-destructive/80 font-mono">
                Immediately halts all outgoing transactions and disables autopilot. Requires manual intervention to un-lock. Sentinel agent can trigger this automatically.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/40 border-border/50 md:col-span-2">
          <CardHeader>
            <CardTitle className="font-mono text-sm uppercase flex items-center gap-2">
              <Globe className="w-4 h-4 text-accent" /> Network Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup value={network} onValueChange={(v: any) => setNetwork(v)} className="flex flex-col gap-4">
              <div className="flex items-center space-x-2 border rounded-lg p-4 bg-background cursor-pointer hover:border-primary/50 transition-colors">
                <RadioGroupItem value="mainnet" id="mainnet" />
                <Label htmlFor="mainnet" className="flex-1 cursor-pointer font-mono">
                  <div className="font-bold">Mainnet Beta</div>
                  <div className="text-xs text-muted-foreground mt-1">Live execution with real funds. Requires Phantom connection.</div>
                </Label>
              </div>
              <div className="flex items-center space-x-2 border rounded-lg p-4 bg-background cursor-pointer hover:border-primary/50 transition-colors">
                <RadioGroupItem value="devnet" id="devnet" />
                <Label htmlFor="devnet" className="flex-1 cursor-pointer font-mono">
                  <div className="font-bold">Devnet</div>
                  <div className="text-xs text-muted-foreground mt-1">Testing environment. Manual key injection permitted.</div>
                </Label>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>

        {/* TxLINE Live Feed Status */}
        <Card className="bg-card/40 border-border/50 md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="font-mono text-sm uppercase flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-green-500" /> TxLINE Live Feed
              </CardTitle>
              <CardDescription className="font-mono text-xs mt-1">
                Real-time cryptographically verifiable sports data · TxODDS Mainnet
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="font-mono text-xs"
              onClick={() => refetchStatus()}
              disabled={statusLoading}
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${statusLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Connection status row */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-background border border-border/50">
              <div className="flex items-center gap-3">
                {statusLoading ? (
                  <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                ) : isConnected ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-destructive" />
                )}
                <div>
                  <div className="font-mono text-sm font-semibold">
                    {statusLoading ? "Connecting…" : isConnected ? "FEED ACTIVE" : "FEED OFFLINE"}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {isConnected
                      ? `TxODDS · Solana Mainnet · Cryptographic proofs enabled`
                      : txlineStatus?.error
                      ? `Error: ${txlineStatus.error.slice(0, 80)}`
                      : "Unable to reach TxLINE API"}
                  </div>
                </div>
              </div>
              <Badge
                variant="outline"
                className={`font-mono text-xs ${
                  isConnected
                    ? "border-green-500/50 text-green-500 bg-green-500/10"
                    : "border-destructive/50 text-destructive bg-destructive/10"
                }`}
              >
                {isConnected ? "● LIVE" : "○ OFFLINE"}
              </Badge>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-background border border-border/50 text-center">
                <div className="font-mono text-2xl font-bold text-primary">
                  {fixturesLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : fixtureCount}
                </div>
                <div className="font-mono text-xs text-muted-foreground mt-1">Live Fixtures</div>
              </div>
              <div className="p-3 rounded-lg bg-background border border-border/50 text-center">
                <div className="font-mono text-2xl font-bold text-accent">WC</div>
                <div className="font-mono text-xs text-muted-foreground mt-1">World Cup + Friendlies</div>
              </div>
              <div className="p-3 rounded-lg bg-background border border-border/50 text-center">
                <div className="font-mono text-2xl font-bold text-green-400">
                  {txlineStatus?.tokenConfigured ? <CheckCircle2 className="w-6 h-6 mx-auto" /> : <XCircle className="w-6 h-6 mx-auto text-destructive" />}
                </div>
                <div className="font-mono text-xs text-muted-foreground mt-1">API Token</div>
              </div>
            </div>

            {/* Live fixture list */}
            {isConnected && txlineFixtures && txlineFixtures.length > 0 && (
              <div className="space-y-2">
                <div className="font-mono text-xs text-muted-foreground uppercase tracking-wider">Available Fixtures</div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {txlineFixtures.slice(0, 20).map((f) => (
                    <div key={f.fixtureId} className="flex items-center justify-between px-3 py-2 rounded bg-background border border-border/30 text-xs font-mono">
                      <span className="text-foreground">
                        <span className="text-primary font-semibold">{f.homeTeam}</span>
                        <span className="text-muted-foreground mx-2">vs</span>
                        <span className="text-primary font-semibold">{f.awayTeam}</span>
                      </span>
                      <div className="flex items-center gap-2">
                        {f.status && (
                          <Badge variant="outline" className={`text-[10px] ${f.status.toLowerCase().includes("live") || f.status.toLowerCase().includes("progress") ? "border-green-500/50 text-green-400" : "border-border/50 text-muted-foreground"}`}>
                            {f.status}
                          </Badge>
                        )}
                        <span className="text-muted-foreground text-[10px]">#{f.fixtureId}</span>
                      </div>
                    </div>
                  ))}
                  {txlineFixtures.length > 20 && (
                    <div className="text-center text-xs text-muted-foreground font-mono py-1">
                      + {txlineFixtures.length - 20} more fixtures
                    </div>
                  )}
                </div>
              </div>
            )}

            {isConnected && (!txlineFixtures || txlineFixtures.length === 0) && !fixturesLoading && (
              <div className="text-center text-xs text-muted-foreground font-mono py-4 border border-dashed border-border/50 rounded-lg">
                <Wifi className="w-6 h-6 mx-auto mb-2 opacity-40" />
                No live fixtures right now — check back during match windows
              </div>
            )}

            <p className="text-xs text-muted-foreground font-mono">
              Powered by <span className="text-primary">TxODDS TxLINE</span> · Cryptographically verifiable StablePrice odds · On-chain anchored to Solana
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
