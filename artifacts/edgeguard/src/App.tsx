import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/use-theme";
import { WalletProvider } from "@/hooks/use-wallet";
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

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/dashboard" component={DashboardRouter} />
      <Route path="/dashboard/*" component={DashboardRouter} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="edgeguard-theme">
      <QueryClientProvider client={queryClient}>
        <WalletProvider>
          <AutopilotProvider>
            <TooltipProvider delayDuration={100}>
              <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
                <Router />
              </WouterRouter>
              <Toaster />
            </TooltipProvider>
          </AutopilotProvider>
        </WalletProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
