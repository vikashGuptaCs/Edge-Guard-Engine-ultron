type AlertFixtureContext = {
  monitoringState?: string | null;
  feedHealth?: string | null;
};

export type AlertConfidenceBand =
  | "suppressed"
  | "degraded"
  | "high"
  | "medium"
  | "low";

export function isPrematchEligibleFixture(fixture: AlertFixtureContext | null | undefined): boolean {
  const state = fixture?.monitoringState;
  return state === "upcoming" || state === "prematch_monitoring";
}

export function isLiveEligibleFixture(fixture: AlertFixtureContext | null | undefined): boolean {
  const state = fixture?.monitoringState;
  return state === "live" || state === "halftime";
}

export function isAlertSuppressedByFeedHealth(fixture: AlertFixtureContext | null | undefined): boolean {
  return fixture?.feedHealth === "error";
}

export function shouldDegradeAlertConfidence(fixture: AlertFixtureContext | null | undefined): boolean {
  return fixture?.feedHealth === "degraded" || fixture?.feedHealth === "empty";
}

export function deriveAlertConfidenceBand(args: {
  fixture: AlertFixtureContext | null | undefined;
  edgeScore?: number | null;
}): AlertConfidenceBand {
  const { fixture, edgeScore } = args;

  if (fixture?.feedHealth === "error") return "suppressed";
  if (fixture?.feedHealth === "degraded" || fixture?.feedHealth === "empty") return "degraded";
  if ((edgeScore ?? 0) >= 80) return "high";
  if ((edgeScore ?? 0) >= 60) return "medium";
  return "low";
}

export function isSignalFresh(ts: string | number | Date | null | undefined, now = Date.now()) {
  if (!ts) return false;
  const signalTs = new Date(ts).getTime();
  return now - signalTs <= 30_000;
}
