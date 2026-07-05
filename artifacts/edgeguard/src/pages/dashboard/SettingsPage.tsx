import React from "react";
import { useAutopilot } from "@/hooks/use-autopilot";
import { useWallet } from "@/hooks/use-wallet";
import { Settings, ShieldAlert, Zap, Globe, Cpu, Link as LinkIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useActivateTxline } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export default function SettingsPage() {
  const { enabled, threshold, hardLocked, setEnabled, setThreshold, setHardLocked } = useAutopilot();
  const { network, setNetwork, publicKey, connected } = useWallet();
  const activateTxline = useActivateTxline();
  const { toast } = useToast();

  const handleActivateTxline = () => {
    if (!connected || !publicKey) return;
    
    activateTxline.mutate({
      data: {
        walletAddress: publicKey,
        signature: "mock_signature_for_demo",
        message: "Verify ownership for EdgeGuard Txline",
        network: network
      }
    }, {
      onSuccess: () => {
        toast({
          title: "Txline Activated",
          description: "Immutable transaction logging is now active on " + network.toUpperCase(),
        });
      },
      onError: (err: any) => {
        toast({
          variant: "destructive",
          title: "Activation Failed",
          description: err.message || "Failed to activate Txline.",
        });
      }
    });
  };

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
        
        <Card className="bg-card/40 border-border/50 md:col-span-2">
          <CardHeader>
            <CardTitle className="font-mono text-sm uppercase flex items-center gap-2">
              <LinkIcon className="w-4 h-4 text-green-500" /> Solana Txline Integration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm font-mono text-muted-foreground">
              Sign a transaction to enable immutable logging of all Orchestrator execution signals to the Solana blockchain.
            </p>
            <Button 
              onClick={handleActivateTxline} 
              disabled={!connected || activateTxline.isPending}
              className="font-mono"
            >
              {activateTxline.isPending ? "Activating..." : "Activate Txline Verifier"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
