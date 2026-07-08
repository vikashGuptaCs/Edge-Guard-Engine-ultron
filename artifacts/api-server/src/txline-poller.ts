import { db } from "@workspace/db";
import { txlineEventsTable, fixturesTable, oddsSnapshotsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  getTxlineFixtures,
  getTxlineOddsSnapshotResult,
  getTxlineOddsUpdatesResult,
  getTxlineScoresSnapshotResult,
  getTxlineScoresUpdatesResult,
} from "./txline-client";
import { logger } from "./lib/logger";

const BASE_POLL_INTERVAL_MS = 5000;
const DISCOVERED_REFRESH_SKIP = 6;
const UPCOMING_REFRESH_SKIP = 3;
const PREMATCH_REFRESH_SKIP = 1;
const LIVE_REFRESH_SKIP = 0;
const HALFTIME_REFRESH_SKIP = 2;
const FINISHED_FINALIZATION_PASSES = 2;

let pollerActive = false;
let pollerTimer: ReturnType<typeof setTimeout> | null = null;
let pollCycleRunning = false;

const fixtureCycleCounts = new Map<number, number>();
const fixtureFinalizationCounts = new Map<number, number>();

type FixtureLifecycleState =
  | "discovered"
  | "upcoming"
  | "prematch_monitoring"
  | "live"
  | "halftime"
  | "finished"
  | "archived";

type FeedHealthState = "unknown" | "healthy" | "degraded" | "empty" | "error";

function nextFixtureCycleCount(fixtureId: number): number {
  const next = (fixtureCycleCounts.get(fixtureId) ?? 0) + 1;
  fixtureCycleCounts.set(fixtureId, next);
  return next;
}

function shouldPollHeavily(monitoringState: string, cycleCount: number): boolean {
  switch (monitoringState) {
    case "discovered":
      return cycleCount % DISCOVERED_REFRESH_SKIP === 0;
    case "upcoming":
      return cycleCount % UPCOMING_REFRESH_SKIP === 0;
    case "prematch_monitoring":
      return cycleCount % PREMATCH_REFRESH_SKIP === 0;
    case "live":
      return LIVE_REFRESH_SKIP === 0 ? true : cycleCount % LIVE_REFRESH_SKIP === 0;
    case "halftime":
      return cycleCount % HALFTIME_REFRESH_SKIP === 0;
    case "finished":
      return true;
    default:
      return false;
  }
}

function shouldContinueFinishedFinalization(fixtureId: number): boolean {
  const count = fixtureFinalizationCounts.get(fixtureId) ?? 0;
  return count < FINISHED_FINALIZATION_PASSES;
}

function markFinishedFinalizationPass(fixtureId: number): void {
  const next = (fixtureFinalizationCounts.get(fixtureId) ?? 0) + 1;
  fixtureFinalizationCounts.set(fixtureId, next);
}

function isTxlineErrorCategory(category: string): boolean {
  return (
    category === "transport_error" ||
    category === "endpoint_error" ||
    category === "auth_error" ||
    category === "parse_error"
  );
}

async function loadLiveFixtureDataWithFallback(fixtureId: number, emptyCount: number) {
  const oddsUpdates = await getTxlineOddsUpdatesResult(fixtureId);
  const scoresUpdates = await getTxlineScoresUpdatesResult(fixtureId);

  const shouldFallback =
    oddsUpdates.data.length + scoresUpdates.data.length === 0 && emptyCount >= 2;

  if (!shouldFallback) {
    return {
      odds: oddsUpdates.data,
      scores: scoresUpdates.data,
      usedFallback: false,
      hadError:
        isTxlineErrorCategory(oddsUpdates.meta.category) ||
        isTxlineErrorCategory(scoresUpdates.meta.category),
    };
  }

  const oddsSnapshot = await getTxlineOddsSnapshotResult(fixtureId);
  const scoresSnapshot = await getTxlineScoresSnapshotResult(fixtureId);

  return {
    odds: oddsSnapshot.data,
    scores: scoresSnapshot.data,
    usedFallback: true,
    hadError:
      isTxlineErrorCategory(oddsSnapshot.meta.category) ||
      isTxlineErrorCategory(scoresSnapshot.meta.category),
  };
}

async function loadSnapshotStyleFixtureData(fixtureId: number) {
  const oddsSnapshot = await getTxlineOddsSnapshotResult(fixtureId);
  const scoresSnapshot = await getTxlineScoresSnapshotResult(fixtureId);

  return {
    odds: oddsSnapshot.data,
    scores: scoresSnapshot.data,
    hadError:
      isTxlineErrorCategory(oddsSnapshot.meta.category) ||
      isTxlineErrorCategory(scoresSnapshot.meta.category),
  };
}

function mapProviderStatus(raw: any): string {
  const gameState = raw?.GameState;

  if (gameState != null) {
    const mapped = {
      0: "pre",
      1: "live",
      2: "halftime",
      3: "finished",
    } as const;

    return mapped[gameState as keyof typeof mapped] ?? `state_${gameState}`;
  }

  return raw?.Status ?? "pre";
}

function computeMonitoringState(args: {
  providerStatus: string;
  kickoffTs: number;
  nowTs: number;
  feedEmptyCount?: number;
}): FixtureLifecycleState {
  const { providerStatus, kickoffTs, nowTs, feedEmptyCount = 0 } = args;

  if (providerStatus === "finished") return "finished";
  if (providerStatus === "halftime") return "halftime";
  if (providerStatus === "live") return "live";

  const msToKickoff = kickoffTs - nowTs;

  if (msToKickoff <= 0 && feedEmptyCount >= 3) {
    return "prematch_monitoring";
  }

  if (msToKickoff <= 30 * 60 * 1000) {
    return "prematch_monitoring";
  }

  if (msToKickoff <= 6 * 60 * 60 * 1000) {
    return "upcoming";
  }

  return "discovered";
}

function computeFeedHealth(args: {
  status: string;
  oddsCount: number;
  scoresCount: number;
  feedEmptyCount: number;
  hadError: boolean;
}): FeedHealthState {
  const { status, oddsCount, scoresCount, feedEmptyCount, hadError } = args;

  if (hadError) return "error";
  if (oddsCount > 0 || scoresCount > 0) return "healthy";

  if (status === "live" || status === "halftime") {
    return feedEmptyCount >= 3 ? "degraded" : "empty";
  }

  return "unknown";
}

async function upsertEvents(
  fixtureId: number,
  category: "odds" | "scores",
  items: unknown[]
): Promise<number> {
  if (!items.length) return 0;
  let count = 0;
  for (const item of items) {
    const rec = item as Record<string, unknown>;
    const ts = (rec["Ts"] as number) ?? Date.now();
    try {
      await db
        .insert(txlineEventsTable)
        .values({ fixtureId, ts, category, payload: rec })
        .onConflictDoNothing();
      count++;
    } catch {
    }
  }
  return count;
}

async function upsertFixtureRecord(f: any): Promise<void> {
  const now = new Date();
  const nowTs = now.getTime();
  const kickoffCandidate = f.StartTime ?? f.KickoffTs ?? 0;
  const kickoffTs =
    typeof kickoffCandidate === "number"
      ? kickoffCandidate
      : Number(kickoffCandidate) || Date.parse(String(kickoffCandidate)) || 0;
  const providerStatus = mapProviderStatus(f);
  const monitoringState = computeMonitoringState({
    providerStatus,
    kickoffTs,
    nowTs,
    feedEmptyCount: 0,
  });
  const fixtureId = Number(f.FixtureId);
  const competition = String(f.Competition ?? f.CompetitionName ?? "Unknown");
  const homeTeam = String(f.Participant1 ?? "Home");
  const awayTeam = String(f.Participant2 ?? "Away");

  try {
    await db
      .insert(fixturesTable)
      .values({
        fixtureId,
        competition,
        homeTeam,
        awayTeam,
        kickoffTs,
        status: providerStatus,
        monitoringState,
        feedHealth: "unknown",
        lastFixtureSyncAt: now,
        lastSuccessfulIngestAt: now,
        lastIngestError: null,
      })
      .onConflictDoUpdate({
        target: fixturesTable.fixtureId,
        set: {
          competition,
          homeTeam,
          awayTeam,
          kickoffTs,
          status: providerStatus,
          monitoringState,
          lastFixtureSyncAt: now,
          lastSuccessfulIngestAt: now,
          lastIngestError: null,
        },
      });
  } catch (err) {
    logger.warn({ err, fixtureId }, "upsertFixtureRecord failed");
  }
}

async function insertOddsSnapshots(fixtureId: number, odds: any[]) {
  if (!Array.isArray(odds) || odds.length === 0) return 0;
  let count = 0;
  for (const o of odds) {
    try {
      const ts = (o.Timestamp ?? Date.now()) as number;
      const market = String(o.Market ?? o.MarketName ?? 'unknown').slice(0, 200);
      const selection = String(o.Selection ?? 'unknown').slice(0, 200);
      const stablePrice = typeof o.Price === 'number' ? o.Price : Number(o.Price) || 0;
      const spread = typeof o.Spread === 'number' ? o.Spread : Number(o.Spread) || 0;
      const volume = typeof o.Volume === 'number' ? o.Volume : Number(o.Volume) || 0;

      await db.insert(oddsSnapshotsTable).values({ fixtureId, ts, market, selection, stablePrice, spread, volume }).onConflictDoNothing();
      count++;
    } catch (err) {
      // ignore per-item errors
    }
  }
  return count;
}

async function pollFixture(fixtureId: number): Promise<void> {
  const [fixture] = await db
    .select()
    .from(fixturesTable)
    .where(eq(fixturesTable.fixtureId, fixtureId))
    .limit(1);

  if (!fixture) return;

  const cycleCount = nextFixtureCycleCount(fixtureId);
  const now = new Date();

  if (!shouldPollHeavily(String(fixture.monitoringState), cycleCount)) {
    return;
  }

  let odds: any[] = [];
  let scores: any[] = [];
  let hadError = false;
  let usedFallback = false;

  try {
    switch (fixture.monitoringState) {
      case "discovered": {
        await db
          .update(fixturesTable)
          .set({ lastSuccessfulIngestAt: now })
          .where(eq(fixturesTable.fixtureId, fixtureId));
        return;
      }

      case "upcoming":
      case "prematch_monitoring": {
        const result = await loadSnapshotStyleFixtureData(fixtureId);
        odds = result.odds;
        scores = result.scores;
        hadError = result.hadError;
        break;
      }

      case "live":
      case "halftime": {
        const result = await loadLiveFixtureDataWithFallback(
          fixtureId,
          Number(fixture.feedEmptyCount ?? 0)
        );
        odds = result.odds;
        scores = result.scores;
        hadError = result.hadError;
        usedFallback = result.usedFallback;
        break;
      }

      case "finished": {
        if (!shouldContinueFinishedFinalization(fixtureId)) {
          return;
        }

        const result = await loadSnapshotStyleFixtureData(fixtureId);
        odds = result.odds;
        scores = result.scores;
        hadError = result.hadError;
        markFinishedFinalizationPass(fixtureId);
        break;
      }

      default:
        return;
    }
  } catch (err) {
    await db
      .update(fixturesTable)
      .set({
        feedHealth: "error",
        lastIngestError: err instanceof Error ? err.message : "Unknown polling error",
      })
      .where(eq(fixturesTable.fixtureId, fixtureId));

    logger.warn({ err, fixtureId }, "txline poller: fixture poll failed");
    return;
  }

  let scoreUpdate: Record<string, number | string> = {};

  if (scores.length > 0) {
    try {
      for (const s of scores) {
        const score = s as Record<string, unknown>;
        const home =
          typeof score["HomeScore"] === "number"
            ? score["HomeScore"]
            : typeof score["homeScore"] === "number"
              ? score["homeScore"]
              : null;
        const away =
          typeof score["AwayScore"] === "number"
            ? score["AwayScore"]
            : typeof score["awayScore"] === "number"
              ? score["awayScore"]
              : null;
        const minute =
          typeof score["Minute"] === "number"
            ? score["Minute"]
            : typeof score["minute"] === "number"
              ? score["minute"]
              : null;
        const providerStatus = mapProviderStatus(score);

        if (home != null) scoreUpdate.homeScore = home as number;
        if (away != null) scoreUpdate.awayScore = away as number;
        if (minute != null) scoreUpdate.minutePlayed = minute as number;
        if (providerStatus !== "pre") scoreUpdate.status = providerStatus;
      }
    } catch {
      // ignore per-item score parsing errors
    }
  }

  const effectiveStatus =
    typeof scoreUpdate.status === "string" ? scoreUpdate.status : String(fixture.status);

  const totalItems = odds.length + scores.length;
  const nextEmptyCount = totalItems === 0 ? Number(fixture.feedEmptyCount ?? 0) + 1 : 0;
  const nextFeedHealth = computeFeedHealth({
    status: effectiveStatus,
    oddsCount: odds.length,
    scoresCount: scores.length,
    feedEmptyCount: nextEmptyCount,
    hadError,
  });

  if (odds.length > 0) {
    await insertOddsSnapshots(fixtureId, odds);
    await upsertEvents(fixtureId, "odds", odds);
  }

  if (scores.length > 0) {
    await upsertEvents(fixtureId, "scores", scores);
  }
  const nextMonitoringState = computeMonitoringState({
    providerStatus: effectiveStatus,
    kickoffTs: Number(fixture.kickoffTs),
    nowTs: now.getTime(),
    feedEmptyCount: nextEmptyCount,
  });

  if (fixture.monitoringState !== nextMonitoringState && nextMonitoringState === "live") {
    logger.info({ fixtureId, from: fixture.monitoringState, to: nextMonitoringState }, "txline poller: fixture entered live");
  }

  if (fixture.monitoringState !== nextMonitoringState && nextMonitoringState === "finished") {
    logger.info({ fixtureId, from: fixture.monitoringState, to: nextMonitoringState }, "txline poller: fixture entered finished");
  }

  if (usedFallback) {
    logger.warn({ fixtureId, feedEmptyCount: fixture.feedEmptyCount }, "txline poller: live snapshot fallback used");
  }

  if (
    (fixture.monitoringState === "live" || fixture.monitoringState === "halftime") &&
    nextFeedHealth === "degraded" &&
    fixture.feedHealth !== "degraded"
  ) {
    logger.warn(
      { fixtureId, feedEmptyCount: nextEmptyCount },
      "txline poller: repeated empty live responses"
    );
  }

  await db
    .update(fixturesTable)
    .set({
      ...scoreUpdate,
      monitoringState: nextMonitoringState,
      feedHealth: usedFallback && nextFeedHealth === "healthy" ? "degraded" : nextFeedHealth,
      feedEmptyCount: nextEmptyCount,
      lastSuccessfulIngestAt: now,
      lastIngestError: null,
      lastOddsSyncAt: odds.length > 0 ? now : fixture.lastOddsSyncAt,
      lastScoresSyncAt: scores.length > 0 ? now : fixture.lastScoresSyncAt,
      lastOddsCursor: fixture.lastOddsCursor,
      lastScoresCursor: fixture.lastScoresCursor,
      firstLiveAt:
        fixture.firstLiveAt ?? (effectiveStatus === "live" ? now : fixture.firstLiveAt),
      finishedAt:
        effectiveStatus === "finished" && !fixture.finishedAt ? now : fixture.finishedAt,
    })
    .where(eq(fixturesTable.fixtureId, fixtureId));
}

async function runPollCycle(): Promise<void> {
  if (pollCycleRunning) return;
  pollCycleRunning = true;

  try {
    const fixtures = await getTxlineFixtures();
    if (!Array.isArray(fixtures) || fixtures.length === 0) return;

    for (const fixture of fixtures) {
      await upsertFixtureRecord(fixture);
    }

    for (const fixture of fixtures) {
      await pollFixture(Number(fixture.FixtureId));
    }
  } catch (err) {
    logger.warn({ err }, "txline poller: cycle failed");
  } finally {
    pollCycleRunning = false;
  }
}

export function startTxlinePoller(): void {
  if (pollerActive) return;
  if (!process.env.TXLINE_API_TOKEN) {
    logger.warn("TXLINE_API_TOKEN not set — TxLINE DVR poller skipped");
    return;
  }

  pollerActive = true;
  logger.info("TxLINE DVR poller started");

  const schedule = () => {
    pollerTimer = setTimeout(async () => {
      if (!pollerActive) return;
      await runPollCycle();
      if (pollerActive) schedule();
    }, BASE_POLL_INTERVAL_MS);
  };

  runPollCycle().then(schedule);
}

export function stopTxlinePoller(): void {
  pollerActive = false;
  if (pollerTimer) {
    clearTimeout(pollerTimer);
    pollerTimer = null;
  }
  logger.info("TxLINE DVR poller stopped");
}
