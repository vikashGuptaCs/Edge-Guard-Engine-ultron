import React from "react";
import { getListFixturesQueryKey, useListFixtures, type Fixture } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { Activity, AlertTriangle, CalendarClock, Clock3 } from "lucide-react";
import { LiveTicker } from "@/components/dashboard/LiveTicker";
import { MonitoringStateCard } from "@/components/dashboard/MonitoringStateCard";
import { RiskGrid } from "@/components/dashboard/RiskGrid";
import { WorkerStatusBadge } from "@/components/dashboard/WorkerStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getFixtureMonitoringState, isFinishedFixture, isLiveFixture, isPrematchFixture, getFixtureStatusLabel } from "@/lib/fixture-status";

type DashboardMode = "live" | "prematch" | "idle" | "degraded";
type DashboardFixture = Fixture;

function deriveDashboardMode(args: {
  liveFixtures: DashboardFixture[];
  upcomingFixtures: DashboardFixture[];
  recentFinishedFixtures: DashboardFixture[];
  hasFeedDegradation: boolean;
}): DashboardMode {
  const { liveFixtures, upcomingFixtures, hasFeedDegradation } = args;

  if (hasFeedDegradation) return "degraded";
  if (liveFixtures.length > 0) return "live";
  if (upcomingFixtures.length > 0) return "prematch";
  return "idle";
}

function isFeedDegraded(fixture: DashboardFixture) {
  return ["degraded", "error", "empty"].includes(fixture.feedHealth ?? "");
}

function formatFreshnessLabel(lastSuccessfulIngestAt?: string | null) {
  if (!lastSuccessfulIngestAt) return "No successful ingest recorded yet";

  const diffMs = Date.now() - new Date(lastSuccessfulIngestAt).getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));

  if (diffSec < 60) return `Updated ${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Updated ${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  return `Updated ${diffHours}h ago`;
}

function getStateBadgeClassName(state: string) {
  switch (state) {
    case "live":
    case "halftime":
      return "border-green-500/40 text-green-400 bg-green-500/10";
    case "prematch_monitoring":
    case "upcoming":
    case "discovered":
      return "border-blue-500/40 text-blue-400 bg-blue-500/10";
    case "finished":
    case "archived":
      return "border-border/50 text-muted-foreground";
    default:
      return "border-border/50 text-muted-foreground";
  }
}

function getFeedBadgeClassName(feedHealth?: string | null) {
  switch (feedHealth) {
    case "healthy":
      return "border-green-500/40 text-green-400 bg-green-500/10";
    case "degraded":
    case "empty":
      return "border-amber-500/40 text-amber-400 bg-amber-500/10";
    case "error":
      return "border-destructive/40 text-destructive bg-destructive/10";
    default:
      return "border-border/50 text-muted-foreground";
  }
}

function formatKickoffLabel(kickoffTs: number) {
  return format(new Date(kickoffTs), "MMM dd, HH:mm");
}

function getFixtureSortTimestamp(fixture: DashboardFixture) {
  if (fixture.archivedAt) return new Date(fixture.archivedAt).getTime();
  if (fixture.finishedAt) return new Date(fixture.finishedAt).getTime();
  return fixture.kickoffTs;
}

function OverviewSection({
  title,
  children,
  actions,
}: {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <Card className="border-border/50 bg-card/40 shadow-sm">
      <CardHeader className="py-3 px-4 border-b bg-muted/20">
        <CardTitle className="text-sm font-mono uppercase tracking-wider flex items-center justify-between gap-3">
          <span>{title}</span>
          {actions}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}

function FixtureSummaryCard({
  fixture,
  subtitle,
  trailing,
}: {
  fixture: DashboardFixture;
  subtitle: string;
  trailing?: React.ReactNode;
}) {
  const monitoringState = getFixtureMonitoringState(fixture);

  return (
    <Link href={`/dashboard/matches/${fixture.fixtureId}`}>
      <div className="rounded-lg border border-border/50 bg-background/50 p-4 transition-colors hover:border-primary/50 hover:bg-muted/20 cursor-pointer">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold text-foreground">
              {fixture.homeTeam} vs {fixture.awayTeam}
            </div>
            <div className="mt-1 text-xs font-mono text-muted-foreground">
              {fixture.competition} · {subtitle}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-[10px] uppercase ${getStateBadgeClassName(monitoringState)}`}>
              {getFixtureStatusLabel(fixture)}
            </Badge>
            <Badge variant="outline" className={`text-[10px] uppercase ${getFeedBadgeClassName(fixture.feedHealth)}`}>
              {fixture.feedHealth ?? "unknown"}
            </Badge>
          </div>
        </div>
        {trailing ? <div className="mt-3">{trailing}</div> : null}
      </div>
    </Link>
  );
}

export default function OverviewPage() {
  const fixtureParams = {};
  const fixturesQuery = useListFixtures(fixtureParams, {
    query: {
      queryKey: getListFixturesQueryKey(fixtureParams),
      refetchInterval: 10_000,
    },
  });

  const fixtures = fixturesQuery.data ?? [];
  const isInitialLoading = fixturesQuery.isLoading && fixtures.length === 0;
  const hasInitialError = fixturesQuery.isError && fixtures.length === 0;

  const liveFixtures = React.useMemo(
    () => fixtures.filter(isLiveFixture).sort((a, b) => a.kickoffTs - b.kickoffTs),
    [fixtures],
  );
  const prematchFixtures = React.useMemo(
    () => fixtures.filter(isPrematchFixture).sort((a, b) => a.kickoffTs - b.kickoffTs),
    [fixtures],
  );
  const recentFinishedFixtures = React.useMemo(
    () =>
      fixtures
        .filter(isFinishedFixture)
        .sort((a, b) => getFixtureSortTimestamp(b) - getFixtureSortTimestamp(a)),
    [fixtures],
  );
  const degradedFixtures = React.useMemo(
    () => fixtures.filter(isFeedDegraded).sort((a, b) => a.kickoffTs - b.kickoffTs),
    [fixtures],
  );
  const nextUpcomingFixture = prematchFixtures[0] ?? null;

  // Only trigger degraded mode if actively-monitored fixtures (live/prematch) have feed issues
  const activeDegradedFixtures = React.useMemo(
    () => [...liveFixtures, ...prematchFixtures].filter(isFeedDegraded),
    [liveFixtures, prematchFixtures],
  );
  const hasFeedDegradation = activeDegradedFixtures.length > 0;
  const dashboardMode = deriveDashboardMode({
    liveFixtures,
    upcomingFixtures: prematchFixtures,
    recentFinishedFixtures,
    hasFeedDegradation,
  });

  const latestSuccessfulIngestAt = React.useMemo(() => {
    const ingestTimes = fixtures
      .map((fixture) => fixture.lastSuccessfulIngestAt)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    return ingestTimes[0] ?? null;
  }, [fixtures]);

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold font-mono tracking-tight text-foreground flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            TERMINAL_OVERVIEW
          </h1>
          <p className="text-sm font-mono text-muted-foreground">
            Live monitoring, pre-match readiness, and feed health in one dashboard.
          </p>
        </div>
        <div className="mt-1">
          <WorkerStatusBadge />
        </div>
      </div>

      {isInitialLoading ? (
        <div className="grid gap-4">
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-80 w-full rounded-lg" />
        </div>
      ) : null}

      {hasInitialError ? (
        <MonitoringStateCard
          title="Dashboard Feed Unavailable"
          value="Retry Needed"
          tone="critical"
          description="Fixture state data could not be loaded, so the dashboard cannot determine whether it should be in live, pre-match, idle, or degraded mode."
        />
      ) : null}

      {!isInitialLoading && !hasInitialError && dashboardMode === "live" ? (
        <>
          <MonitoringStateCard
            title="Active Monitoring"
            value={`${liveFixtures.length} live fixture${liveFixtures.length === 1 ? "" : "s"}`}
            description="Live fixtures are being tracked in real time and the risk grid is actively scoring execution conditions."
          />

          <div className="border border-border/50 rounded-lg overflow-hidden bg-card shadow-sm">
            <div className="bg-muted px-4 py-2 border-b font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Live Market Feed
            </div>
            <LiveTicker />
          </div>

          <Card className="flex-1 border-border/50 shadow-sm flex flex-col overflow-hidden">
            <CardHeader className="py-3 px-4 border-b bg-muted/30">
              <CardTitle className="text-sm font-mono uppercase tracking-wider flex justify-between items-center">
                <span>Active Risk Grid</span>
                <div className="flex items-center gap-2 text-[10px] text-green-500">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  LIVE
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-auto">
              <RiskGrid />
            </CardContent>
          </Card>

          {nextUpcomingFixture ? (
            <OverviewSection title="Next Upcoming Match">
              <FixtureSummaryCard
                fixture={nextUpcomingFixture}
                subtitle={`Kickoff ${formatKickoffLabel(nextUpcomingFixture.kickoffTs)}`}
                trailing={
                  <div className="flex flex-col gap-1 text-xs font-mono text-muted-foreground">
                    <span>Next monitored fixture scheduled after the current live match.</span>
                    <span>{formatFreshnessLabel(nextUpcomingFixture.lastSuccessfulIngestAt)}</span>
                  </div>
                }
              />
            </OverviewSection>
          ) : null}
        </>
      ) : null}

      {!isInitialLoading && !hasInitialError && dashboardMode === "prematch" ? (
        <>
          <MonitoringStateCard
            title="Starting Soon"
            value={`${prematchFixtures.length} fixture${prematchFixtures.length === 1 ? "" : "s"}`}
            tone="warning"
            description="Markets and feed readiness are being monitored before kickoff. No live fixtures need active intervention yet."
          />

          <OverviewSection
            title="Upcoming Fixtures"
            actions={
              <span className="text-[10px] text-muted-foreground">
                Freshness: {formatFreshnessLabel(latestSuccessfulIngestAt)}
              </span>
            }
          >
            <div className="grid gap-3 md:grid-cols-2">
              {prematchFixtures.slice(0, 6).map((fixture) => (
                <FixtureSummaryCard
                  key={fixture.fixtureId}
                  fixture={fixture}
                  subtitle={`Kickoff ${formatKickoffLabel(fixture.kickoffTs)}`}
                  trailing={
                    <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {formatFreshnessLabel(fixture.lastSuccessfulIngestAt)}
                      </span>
                      <span>Edge {fixture.currentEdgeScore?.toFixed(1) ?? "—"}</span>
                    </div>
                  }
                />
              ))}
            </div>
          </OverviewSection>

          {recentFinishedFixtures.length > 0 ? (
            <OverviewSection title="Recent Results">
              <div className="grid gap-3 md:grid-cols-2">
                {recentFinishedFixtures.slice(0, 4).map((fixture) => (
                  <FixtureSummaryCard
                    key={fixture.fixtureId}
                    fixture={fixture}
                    subtitle={`${fixture.homeScore ?? "?"} - ${fixture.awayScore ?? "?"} final`}
                    trailing={
                      <div className="text-xs font-mono text-muted-foreground">
                        {formatFreshnessLabel(fixture.lastSuccessfulIngestAt)}
                      </div>
                    }
                  />
                ))}
              </div>
            </OverviewSection>
          ) : null}
        </>
      ) : null}

      {!isInitialLoading && !hasInitialError && dashboardMode === "idle" ? (
        <>
          <MonitoringStateCard
            title="No Live Matches Right Now"
            value="Idle"
            description="The system is online and waiting for the next monitored fixtures. This is different from a feed problem."
          />

          <OverviewSection
            title="System Freshness"
            actions={
              <span className="text-[10px] text-muted-foreground">
                Latest ingest: {formatFreshnessLabel(latestSuccessfulIngestAt)}
              </span>
            }
          >
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-border/50 bg-background/50 p-4">
                <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Mode</div>
                <div className="mt-2 text-lg font-semibold">Idle</div>
              </div>
              <div className="rounded-lg border border-border/50 bg-background/50 p-4">
                <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Upcoming</div>
                <div className="mt-2 text-lg font-semibold">{prematchFixtures.length}</div>
              </div>
              <div className="rounded-lg border border-border/50 bg-background/50 p-4">
                <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Recent Results</div>
                <div className="mt-2 text-lg font-semibold">{recentFinishedFixtures.length}</div>
              </div>
            </div>
          </OverviewSection>

          <OverviewSection title="Next Up">
            {prematchFixtures.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {prematchFixtures.slice(0, 4).map((fixture) => (
                  <FixtureSummaryCard
                    key={fixture.fixtureId}
                    fixture={fixture}
                    subtitle={`Kickoff ${formatKickoffLabel(fixture.kickoffTs)}`}
                    trailing={
                      <div className="text-xs font-mono text-muted-foreground">
                        {formatFreshnessLabel(fixture.lastSuccessfulIngestAt)}
                      </div>
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                No upcoming monitored fixtures are currently scheduled.
              </div>
            )}
          </OverviewSection>

          <OverviewSection title="Recent Results">
            {recentFinishedFixtures.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {recentFinishedFixtures.slice(0, 6).map((fixture) => (
                  <FixtureSummaryCard
                    key={fixture.fixtureId}
                    fixture={fixture}
                    subtitle={`${fixture.homeScore ?? "?"} - ${fixture.awayScore ?? "?"} final`}
                    trailing={
                      <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
                        <span>{getFixtureMonitoringState(fixture).replace(/_/g, " ")}</span>
                        <span>{formatFreshnessLabel(fixture.lastSuccessfulIngestAt)}</span>
                      </div>
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                No recent finished fixtures are available yet.
              </div>
            )}
          </OverviewSection>
        </>
      ) : null}

      {!isInitialLoading && !hasInitialError && dashboardMode === "degraded" ? (
        <>
          <MonitoringStateCard
            title="Feed Degraded"
            value="Attention Needed"
            tone="critical"
            description="Provider data is delayed, empty, or failing for one or more monitored fixtures. This is distinct from normal no-live idle time."
          />

          {liveFixtures.length > 0 ? (
            <div className="border border-border/50 rounded-lg overflow-hidden bg-card shadow-sm">
              <div className="bg-muted px-4 py-2 border-b font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Live Market Feed
              </div>
              <LiveTicker />
            </div>
          ) : null}

          {liveFixtures.length > 0 ? (
            <Card className="border-border/50 shadow-sm flex flex-col overflow-hidden">
              <CardHeader className="py-3 px-4 border-b bg-muted/30">
                <CardTitle className="text-sm font-mono uppercase tracking-wider flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  Risk Grid During Degradation
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-auto">
                <RiskGrid />
              </CardContent>
            </Card>
          ) : null}

          <OverviewSection title="Data Freshness">
            <div className="grid gap-3 md:grid-cols-2">
              {activeDegradedFixtures.slice(0, 8).map((fixture) => (
                <FixtureSummaryCard
                  key={fixture.fixtureId}
                  fixture={fixture}
                  subtitle={`Kickoff ${formatKickoffLabel(fixture.kickoffTs)}`}
                  trailing={
                    <div className="space-y-1 text-xs font-mono text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock3 className="h-3.5 w-3.5" />
                        {formatFreshnessLabel(fixture.lastSuccessfulIngestAt)}
                      </div>
                      <div>{fixture.lastIngestError ? `Last error: ${fixture.lastIngestError}` : "Monitoring for recovery"}</div>
                    </div>
                  }
                />
              ))}
            </div>
          </OverviewSection>
        </>
      ) : null}
    </div>
  );
}
