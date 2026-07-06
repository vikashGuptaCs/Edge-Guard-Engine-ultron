import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useWallet } from "@/hooks/use-wallet";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Key, Wallet, ArrowLeft, Loader2, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { connect, disconnect, connected, connecting, publicKey, source } = useWallet();
  const [mode, setMode] = useState<"select" | "viewer">("select");
  const [viewerKey, setViewerKey] = useState("");
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    if (connected && publicKey) {
      setLocation("/dashboard");
    }
  }, [connected, publicKey, setLocation]);

  const handlePhantomConnect = async () => {
    setConnectError(null);
    try {
      await connect("phantom");
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      if (msg.includes("not installed") || msg.includes("not found") || msg.includes("Phantom")) {
        setConnectError("Phantom wallet not detected. Please install the Phantom browser extension.");
      } else if (msg.includes("User rejected")) {
        setConnectError("Connection rejected. Please approve in Phantom.");
      } else {
        setConnectError(msg);
      }
    }
  };

  const handleViewerMode = () => {
    if (viewerKey.trim().length >= 32) {
      connect("manual", viewerKey.trim());
      setLocation("/dashboard");
    }
  };

  const isPhantomInstalled = typeof window !== "undefined" && !!(window as any).phantom?.solana?.isPhantom;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Button
          variant="ghost"
          className="mb-6 font-mono text-muted-foreground hover:text-foreground"
          onClick={() => mode === "viewer" ? setMode("select") : setLocation("/")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {mode === "viewer" ? "Back" : "Home"}
        </Button>

        <Card className="border-border bg-card/50 backdrop-blur shadow-2xl">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl font-mono tracking-tight text-primary">TERMINAL_AUTH</CardTitle>
            <CardDescription className="font-mono">Authenticate to access EdgeGuard systems</CardDescription>
          </CardHeader>

          <CardContent className="pt-6">
            {mode === "select" ? (
              <div className="grid gap-4">
                {/* Phantom wallet button */}
                <Button
                  size="lg"
                  className="w-full h-16 text-lg font-mono flex items-center justify-between px-6 bg-purple-600 hover:bg-purple-700 text-white border-0 disabled:opacity-70"
                  onClick={handlePhantomConnect}
                  disabled={connecting}
                >
                  <div className="flex items-center gap-3">
                    {connecting ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      <Wallet className="w-6 h-6" />
                    )}
                    <span>{connecting ? "Connecting…" : "Connect Phantom"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isPhantomInstalled ? (
                      <Badge variant="outline" className="border-green-400/60 text-green-400 text-[10px] bg-green-400/10">
                        ● Detected
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-yellow-400/60 text-yellow-400 text-[10px] bg-yellow-400/10">
                        Install
                      </Badge>
                    )}
                  </div>
                </Button>

                {!isPhantomInstalled && (
                  <a
                    href="https://phantom.app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 text-xs font-mono text-muted-foreground hover:text-primary transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Install Phantom at phantom.app
                  </a>
                )}

                {connectError && (
                  <Alert variant="destructive" className="bg-destructive/10 border-destructive/50">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription className="font-mono text-xs">{connectError}</AlertDescription>
                  </Alert>
                )}

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-muted" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase font-mono">
                    <span className="bg-card px-2 text-muted-foreground">Or viewer mode</span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="lg"
                  className="w-full h-14 font-mono flex items-center justify-center gap-2 border-dashed border-2 hover:border-primary hover:text-primary transition-colors"
                  onClick={() => setMode("viewer")}
                >
                  <Key className="w-5 h-5" />
                  <span>Read-Only Viewer Mode</span>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <Alert className="bg-accent/10 border-accent/50 text-accent-foreground">
                  <AlertTriangle className="h-4 w-4 text-accent" />
                  <AlertTitle className="font-mono font-bold uppercase tracking-wider text-accent">Viewer Mode</AlertTitle>
                  <AlertDescription className="font-mono text-xs mt-2 text-muted-foreground">
                    Enter a Solana public key (Base58) to view the dashboard in read-only mode. No transactions can be executed.
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <label className="text-sm font-mono text-muted-foreground uppercase">Solana Public Key</label>
                  <textarea
                    placeholder="Paste Base58 public key..."
                    className="w-full font-mono h-20 bg-background border border-border rounded-md p-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                    value={viewerKey}
                    onChange={(e) => setViewerKey(e.target.value)}
                  />
                </div>

                <Button
                  size="lg"
                  className="w-full font-mono uppercase tracking-widest font-bold h-12"
                  disabled={viewerKey.trim().length < 32}
                  onClick={handleViewerMode}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Enter Read-Only Mode
                </Button>
              </div>
            )}
          </CardContent>
          <CardFooter className="justify-center border-t border-border/50 py-4 text-xs font-mono text-muted-foreground">
            Solana Devnet · End-to-end encryption active · v3.0.5
          </CardFooter>
        </Card>

        <p className="text-center text-xs font-mono text-muted-foreground mt-4">
          Phantom connects to Solana Devnet for TxLINE subscription and on-chain audit receipts
        </p>
      </div>
    </div>
  );
}
