export type FixtureLifecycleState =
  | "discovered"
  | "upcoming"
  | "prematch_monitoring"
  | "live"
  | "halftime"
  | "finished"
  | "archived";

export interface FixtureStatusLike {
  monitoringState?: string | null;
  status?: string | null;
  isLive?: boolean | null;
  isFinished?: boolean | null;
  kickoffTs?: number;
  minutePlayed?: number | null;
}

function normalizeState(value?: string | null): string {
  return (value ?? "").toLowerCase().replace(/\s+/g, "_").replace(/-+/g, "_");
}

export function getFixtureMonitoringState(fixture: FixtureStatusLike): FixtureLifecycleState {
  const fromMonitoring = normalizeState(fixture.monitoringState);
  if (fromMonitoring) {
    if (fromMonitoring === "live" || fromMonitoring === "halftime" || fromMonitoring === "finished" || fromMonitoring === "archived" || fromMonitoring === "prematch_monitoring" || fromMonitoring === "upcoming" || fromMonitoring === "discovered") {
      return fromMonitoring as FixtureLifecycleState;
    }
  }

  const fromStatus = normalizeState(fixture.status);
  if (fromStatus === "live" || fromStatus === "halftime" || fromStatus === "finished" || fromStatus === "archived") {
    return fromStatus as FixtureLifecycleState;
  }

  if (fixture.isLive) return "live";
  if (fixture.isFinished) return "finished";

  return "upcoming";
}

export function isLiveFixture(fixture: FixtureStatusLike): boolean {
  const state = getFixtureMonitoringState(fixture);
  return state === "live" || state === "halftime";
}

export function isPrematchFixture(fixture: FixtureStatusLike): boolean {
  const state = getFixtureMonitoringState(fixture);
  return state === "discovered" || state === "upcoming" || state === "prematch_monitoring";
}

export function isFinishedFixture(fixture: FixtureStatusLike): boolean {
  const state = getFixtureMonitoringState(fixture);
  return state === "finished" || state === "archived";
}

export function getFixtureStatusLabel(fixture: FixtureStatusLike): string {
  const state = getFixtureMonitoringState(fixture);
  return state.replace(/_/g, " ");
}

export function getFixtureStatusTone(state: FixtureLifecycleState): string {
  switch (state) {
    case "live":
    case "halftime":
      return "live";
    case "prematch_monitoring":
    case "upcoming":
    case "discovered":
      return "prematch";
    case "finished":
    case "archived":
      return "finished";
    default:
      return "prematch";
  }
}
