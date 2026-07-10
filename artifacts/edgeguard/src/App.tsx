import React, { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/use-theme";
import { WalletProvider, useWallet } from "@/hooks/use-wallet";
import { useWalletRestore } from "@/hooks/use-wallet-restore";
import { AutopilotProvider } from "@/hooks/use-autopilot";
import NotFound from "@/pages/not-found";

import LandingPage from "@/pages/LandingPage";
import AuthPage from "@/pages/AuthPage";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import OverviewPage from "@/pages/dashboard/OverviewPage";
import MatchesPage from "@/pages/dashboard/MatchesPage";
import MatchDetailPage from "@/pages/dashboard/MatchDetailPage";
import AgentsPage from "@/pages/dashboard/AgentsPage";
import AlertsPage from "@/pages/dashboard/AlertsPage";
import ReceiptsPage from "@/pages/dashboard/ReceiptsPage";
import SettingsPage from "@/pages/dashboard/SettingsPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function DashboardRouter() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/dashboard" component={OverviewPage} />
        <Route path="/dashboard/" component={OverviewPage} />
        <Route path="/dashboard/matches" component={MatchesPage} />
        <Route path="/dashboard/matches/:fixtureId" component={MatchDetailPage} />
        <Route path="/dashboard/agents" component={AgentsPage} />
        <Route path="/dashboard/alerts" component={AlertsPage} />
        <Route path="/dashboard/receipts" component={ReceiptsPage} />
        <Route path="/dashboard/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function RequireWallet({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const { connected, authState } = useWallet();
  const isRestoring = authState === "unknown" || authState === "restoring";

  useEffect(() => {
    if (!connected && !isRestoring) {
      setLocation("/auth");
    }
  }, [connected, isRestoring, setLocation]);

  if (connected) {
    return <>{children}</>;
  }

  if (isRestoring) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <div className="font-mono text-sm text-muted-foreground">Restoring wallet session...</div>
      </div>
    );
  }

  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/dashboard">
        <RequireWallet>
          <DashboardRouter />
        </RequireWallet>
      </Route>
      <Route path="/dashboard/*">
        <RequireWallet>
          <DashboardRouter />
        </RequireWallet>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="edgeguard-theme">
      <QueryClientProvider client={queryClient}>
        <WalletProvider>
          <AuthLoader>
            <AutopilotProvider>
              <TooltipProvider delayDuration={100}>
                <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
                  <Router />
                </WouterRouter>
                <Toaster />
              </TooltipProvider>
            </AutopilotProvider>
          </AuthLoader>
        </WalletProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function AuthLoader({ children }: { children: React.ReactNode }) {
  useWalletRestore();
  return <>{children}</>;
}

export default App;
