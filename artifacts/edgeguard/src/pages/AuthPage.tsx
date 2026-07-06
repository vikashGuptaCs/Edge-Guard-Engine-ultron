import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useWallet } from "@/hooks/use-wallet";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Key, Wallet, ArrowLeft, Loader2, CheckCircle2, XCircle, ExternalLink, ShieldCheck, RefreshCw, Copy, Check } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { connect, connected, connecting, publicKey, error, connectionState, reconnect } = useWallet();
  const [mode, setMode] = useState<"select" | "viewer">("select");
  const [viewerKey, setViewerKey] = useState("");
  const [connectError, setConnectError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (connected && publicKey) {
      const timer = setTimeout(() => setLocation("/dashboard"), 800);
      return () => clearTimeout(timer);
    }
  }, [connected, publicKey, setLocation]);

  // Update error state from wallet
  useEffect(() => {
    if (error) {
      setConnectError(error);
    }
  }, [error]);

  const handlePhantomConnect = async () => {
    setConnectError(null);
    try {
      await connect("phantom");
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      setConnectError(msg);
    }
  };

  const handleRetryConnect = async () => {
    setIsRetrying(true);
    try {
      await reconnect();
    } finally {
      setIsRetrying(false);
    }
  };

  const handleViewerMode = async () => {
    const normalizedKey = viewerKey.trim();
    setConnectError(null);

    if (normalizedKey.length < 32) {
      setConnectError("Public key must be at least 32 characters long.");
      return;
    }

    try {
      await connect("manual", normalizedKey);
    } catch (err: any) {
      setConnectError(err?.message ?? "Unable to enter viewer mode right now.");
    }
  };

  const copyToClipboard = async () => {
    if (publicKey) {
      try {
        await navigator.clipboard.writeText(publicKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    }
  };

  const isPhantomInstalled = typeof window !== "undefined" && !!(window as any).phantom?.solana?.isPhantom;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.16),transparent_50%)] bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Button
          variant="ghost"
          className="mb-6 font-mono text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => (mode === "viewer" ? setMode("select") : setLocation("/"))}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {mode === "viewer" ? "Back to Options" : "Return Home"}
        </Button>

        <Card className="border-border/70 bg-card/70 backdrop-blur-xl shadow-2xl overflow-hidden">
          <CardHeader className="text-center pb-2 border-b border-border/50">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl font-mono tracking-tight text-primary">TERMINAL_AUTH</CardTitle>
            <CardDescription className="font-mono text-sm text-muted-foreground mt-1">
              Authenticate with Phantom or use read-only viewer mode
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-6">
            {mode === "select" ? (
              <div className="grid gap-4 animate-in fade-in duration-300">
                {/* Connection Status Indicator */}
                {connectionState !== 'idle' && connectionState !== 'error' && (
                  <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 flex items-center gap-2 text-sm font-mono">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                        <span className="text-blue-400">
                          {connectionState === 'connecting' && 'Connecting wallet...'}
                          {connectionState === 'reconnecting' && 'Attempting to reconnect...'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Main Connect Button */}
                <Button
                  size="lg"
                  className="w-full h-16 text-lg font-mono flex items-center justify-between px-6 bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white border-0 disabled:opacity-70 transition-all duration-200 group"
                  onClick={handlePhantomConnect}
                  disabled={connecting || connectionState === 'connecting'}
                >
                  <div className="flex items-center gap-3">
                    {connecting || connectionState === 'connecting' ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      <Wallet className="w-6 h-6 group-hover:scale-110 transition-transform" />
                    )}
                    <span>{connecting || connectionState === 'connecting' ? "Connecting…" : "Connect Phantom Wallet"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isPhantomInstalled ? (
                      <Badge variant="outline" className="border-emerald-400/60 text-emerald-400 text-[10px] bg-emerald-400/10 font-mono">
                        ● Detected
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-400/60 text-amber-400 text-[10px] bg-amber-400/10 font-mono">
                        Install Required
                      </Badge>
                    )}
                  </div>
                </Button>

                {!isPhantomInstalled && (
                  <a
                    href="https://phantom.app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 text-xs font-mono text-muted-foreground hover:text-primary transition-colors py-2 px-3 rounded-md border border-dashed border-muted-foreground/30 hover:border-primary/30"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Install Phantom at phantom.app
                  </a>
                )}

                {/* Error Alert with Retry */}
                {connectError && (
                  <Alert variant="destructive" className="bg-destructive/10 border-destructive/50 animate-in fade-in slide-in-from-top-2 duration-300">
                    <XCircle className="h-4 w-4" />
                    <div className="flex-1 ml-2">
                      <AlertDescription className="font-mono text-xs text-destructive">
                        {connectError}
                      </AlertDescription>
                    </div>
                    {connectionState === 'error' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs font-mono text-destructive hover:bg-destructive/20"
                        onClick={handleRetryConnect}
                        disabled={isRetrying}
                      >
                        {isRetrying ? (
                          <>
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            Retrying
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3 h-3 mr-1" />
                            Retry
                          </>
                        )}
                      </Button>
                    )}
                  </Alert>
                )}

                {/* Divider */}
                <div className="relative my-2">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-muted" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase font-mono">
                    <span className="bg-card px-2 text-muted-foreground">or read-only</span>
                  </div>
                </div>

                {/* Viewer Mode Button */}
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full h-14 font-mono flex items-center justify-center gap-2 border-dashed border-2 hover:border-primary/60 hover:text-primary hover:bg-primary/5 transition-all duration-200"
                  onClick={() => setMode("viewer")}
                >
                  <Key className="w-5 h-5" />
                  <span>Read-Only Viewer Mode</span>
                </Button>
              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in duration-300">
                {/* Viewer Mode Info */}
                <Alert className="bg-accent/10 border-accent/50 text-accent-foreground">
                  <AlertTriangle className="h-4 w-4 text-accent flex-shrink-0" />
                  <div className="ml-3">
                    <AlertTitle className="font-mono font-bold uppercase tracking-wider text-accent text-sm">
                      Read-Only Access
                    </AlertTitle>
                    <AlertDescription className="font-mono text-xs mt-2 text-muted-foreground">
                      Enter a Solana public key to view the dashboard. No transactions can be executed. All features are in observation mode only.
                    </AlertDescription>
                  </div>
                </Alert>

                {/* Input Section */}
                <div className="space-y-3 bg-muted/30 rounded-lg p-4 border border-border/50">
                  <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    Solana Public Key (Base58)
                  </label>
                  <textarea
                    placeholder="Paste a valid Solana public key here..."
                    className="w-full font-mono h-24 bg-background border border-border rounded-md p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all placeholder:text-muted-foreground/40"
                    value={viewerKey}
                    onChange={(e) => setViewerKey(e.target.value)}
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
                    <span>{viewerKey.trim().length} characters</span>
                    {viewerKey.trim().length >= 32 && (
                      <span className="flex items-center gap-1 text-emerald-500">
                        <CheckCircle2 className="w-3 h-3" />
                        Valid length
                      </span>
                    )}
                  </div>
                </div>

                {/* Validation Error */}
                {connectError && mode === 'viewer' && (
                  <Alert variant="destructive" className="bg-destructive/10 border-destructive/50 animate-in fade-in slide-in-from-top-2 duration-300">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription className="font-mono text-xs ml-2">
                      {connectError}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Submit Button */}
                <Button
                  size="lg"
                  className="w-full font-mono uppercase tracking-widest font-bold h-12 transition-all duration-200"
                  disabled={viewerKey.trim().length < 32 || connecting}
                  onClick={handleViewerMode}
                >
                  {connecting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Validating…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Enter Read-Only Mode
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>

          <CardFooter className="justify-center border-t border-border/50 py-4 text-xs font-mono text-muted-foreground bg-muted/30">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              <span>Solana Devnet · End-to-end encryption · v3.1.0</span>
            </div>
          </CardFooter>
        </Card>

        <p className="text-center text-xs font-mono text-muted-foreground mt-4 max-w-xs mx-auto">
          Phantom connects to Solana Devnet for subscription management and on-chain audit receipts.
        </p>
      </div>
    </div>
  );
}
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
                    placeholder="Paste a Base58 public key..."
                    className="w-full font-mono h-24 bg-background border border-border rounded-md p-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
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

            {connectError && (
              <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm font-mono text-destructive">
                {connectError}
              </div>
            )}
          </CardContent>
          <CardFooter className="justify-center border-t border-border/50 py-4 text-xs font-mono text-muted-foreground">
            Solana Devnet · End-to-end encryption active · v3.0.5
          </CardFooter>
        </Card>

        <p className="text-center text-xs font-mono text-muted-foreground mt-4">
          Phantom connects to Solana Devnet for TxLINE subscription and on-chain audit receipts.
        </p>
      </div>
    </div>
  );
}
