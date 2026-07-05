import React, { useState } from "react";
import { useLocation } from "wouter";
import { useWallet } from "@/hooks/use-wallet";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Key, Wallet, ArrowLeft } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { connect } = useWallet();
  const [mode, setMode] = useState<'select' | 'manual'>('select');
  const [key, setKey] = useState('');

  const handlePhantom = () => {
    connect('phantom');
    setLocation('/dashboard');
  };

  const handleManual = () => {
    if (key.length > 30) {
      connect('manual', key);
      setLocation('/dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Button 
          variant="ghost" 
          className="mb-6 font-mono text-muted-foreground hover:text-foreground"
          onClick={() => mode === 'manual' ? setMode('select') : setLocation('/')}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {mode === 'manual' ? 'Back' : 'Home'}
        </Button>

        <Card className="border-border bg-card/50 backdrop-blur shadow-2xl">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl font-mono tracking-tight text-primary">TERMINAL_AUTH</CardTitle>
            <CardDescription className="font-mono">Authenticate to access EdgeGuard systems</CardDescription>
          </CardHeader>
          
          <CardContent className="pt-6">
            {mode === 'select' ? (
              <div className="grid gap-4">
                <Button 
                  size="lg" 
                  className="w-full h-16 text-lg font-mono flex items-center justify-between px-6 bg-purple-600 hover:bg-purple-700 text-white border-0"
                  onClick={handlePhantom}
                >
                  <div className="flex items-center gap-3">
                    <Wallet className="w-6 h-6" />
                    <span>Connect Phantom</span>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                </Button>
                
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-muted" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase font-mono">
                    <span className="bg-card px-2 text-muted-foreground">Or advanced mode</span>
                  </div>
                </div>
                
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="w-full h-14 font-mono flex items-center justify-center gap-2 border-dashed border-2 hover:border-primary hover:text-primary transition-colors"
                  onClick={() => setMode('manual')}
                >
                  <Key className="w-5 h-5" />
                  <span>Manual Key Injection</span>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <Alert variant="destructive" className="bg-destructive/10 border-destructive/50 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle className="font-mono font-bold uppercase tracking-wider">Warning</AlertTitle>
                  <AlertDescription className="font-mono text-xs mt-2">
                    Manual key injection exposes raw private keys to memory. Only use this in Devnet environments or isolated VMs.
                  </AlertDescription>
                </Alert>
                
                <div className="space-y-2">
                  <label className="text-sm font-mono text-muted-foreground uppercase">Base58 Private Key</label>
                  <Textarea 
                    placeholder="Enter raw key string..." 
                    className="font-mono h-24 bg-background border-muted resize-none focus-visible:ring-destructive focus-visible:border-destructive"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                  />
                </div>
                
                <Button 
                  size="lg" 
                  variant="destructive"
                  className="w-full font-mono uppercase tracking-widest font-bold h-12"
                  disabled={key.length < 30}
                  onClick={handleManual}
                >
                  Inject Key & Connect
                </Button>
              </div>
            )}
          </CardContent>
          <CardFooter className="justify-center border-t border-border/50 py-4 text-xs font-mono text-muted-foreground">
            End-to-end encryption active • v3.0.4
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
