import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useWallet } from "@/hooks/use-wallet";
import { Button } from "@/components/ui/button";
import { ShieldAlert, ArrowRight, Activity, Zap, Lock } from "lucide-react";

export default function LandingPage() {
  const [, setLocation] = useLocation();
  const { connected } = useWallet();

  const handleConnect = () => {
    if (connected) {
      setLocation("/dashboard");
    } else {
      setLocation("/auth");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background terminal decoration */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-20">
        <div className="absolute top-0 left-0 w-full h-full bg-[linear-gradient(to_bottom,transparent_0%,rgba(0,0,0,0.8)_100%)] z-10" />
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/20 blur-[100px] rounded-full" />
        
        {/* Fake terminal code lines */}
        <div className="absolute top-10 left-10 text-primary/30 font-mono text-xs space-y-1 opacity-50">
          <p>{'>'} INIT edgeguard_core.rs</p>
          <p>{'>'} CONNECT wss://feed.sportsapi.net</p>
          <p className="text-green-500/50">{'>'} FEED ESTABLISHED latency=42ms</p>
          <p>{'>'} START agent_orchestrator</p>
          <p>{'>'} ALLOCATING buffer pools...</p>
        </div>
      </div>

      <div className="z-20 max-w-4xl px-6 text-center flex flex-col items-center">
        <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-2xl mb-8 border border-primary/20 shadow-[0_0_30px_rgba(var(--primary),0.2)]">
          <ShieldAlert className="w-12 h-12 text-primary" />
        </div>
        
        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-6 font-mono">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">EDGE</span>GUARD
        </h1>
        
        <p className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-2xl font-mono leading-relaxed">
          Institutional quant trading dashboard. Micro-second execution. 
          Toxic flow protection. Multi-agent risk analysis.
        </p>

        <Button 
          size="lg" 
          onClick={handleConnect}
          className="text-lg px-8 h-14 font-mono font-bold tracking-widest group shadow-[0_0_20px_rgba(var(--primary),0.4)] hover:shadow-[0_0_40px_rgba(var(--primary),0.6)] transition-all"
        >
          {connected ? "ENTER DASHBOARD" : "CONNECT TERMINAL"}
          <ArrowRight className="ml-3 w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </Button>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24 text-left border-t border-border/50 pt-12">
          <div className="space-y-3">
            <Zap className="w-6 h-6 text-primary" />
            <h3 className="font-bold text-lg font-mono">Sub-ms Latency</h3>
            <p className="text-sm text-muted-foreground">Direct feed connections with optimized Rust backends to beat the market spread.</p>
          </div>
          <div className="space-y-3">
            <Activity className="w-6 h-6 text-accent" />
            <h3 className="font-bold text-lg font-mono">Agent Ensembles</h3>
            <p className="text-sm text-muted-foreground">5 distinct ML models running in parallel to validate signals and prevent false positives.</p>
          </div>
          <div className="space-y-3">
            <Lock className="w-6 h-6 text-green-500" />
            <h3 className="font-bold text-lg font-mono">Slippage Veto</h3>
            <p className="text-sm text-muted-foreground">Automated toxic flow detection that vetoes executions when odds jump aggressively.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
