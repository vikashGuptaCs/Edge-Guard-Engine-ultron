import { db } from "@workspace/db";
import { txlineEventsTable, fixturesTable, oddsSnapshotsTable, scoreEventsTable, agentSignalsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
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
const RECENT_RESULTS_RETENTION_MS = 24 * 60 * 60 * 1000;

// How far before kickoff we're willing to accept a provider 'live' claim
// without additional in-play evidence. This prevents transient provider
// glitches from flipping fixtures to `live` hours before the match.
const MS_ALLOW_LIVE_BEFORE_KICKOFF = 5 * 60 * 1000; // 5 minutes

let pollerActive = false;
let pollerTimer: ReturnType<typeof setTimeout> | null = null;
let pollCycleRunning = false;

type PollerRuntimeState = {
  active: boolean;
  startedAt: string | null;
  lastCycleStartedAt: string | null;
  lastCycleFinishedAt: string | null;
  lastCycleSucceeded: boolean | null;
  lastCycleError: string | null;
};

const pollerRuntimeState: PollerRuntimeState = {
  active: false,
  startedAt: null,
  lastCycleStartedAt: null,
  lastCycleFinishedAt: null,
  lastCycleSucceeded: null,
  lastCycleError: null,
};

const fixtureCycleCounts = new Map<number, number>();
const fixtureFinalizationCounts = new Map<number, number>();

export function getTxlinePollerRuntimeState(): PollerRuntimeState {
  return { ...pollerRuntimeState };
}

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

function deriveLifecycleTransitionFields(args: {
  currentStatus: string;
  nextStatus: string;
  firstLiveAt: Date | null | undefined;
  finishedAt: Date | null | undefined;
  now: Date;
}) {
  const { currentStatus, nextStatus, firstLiveAt, finishedAt, now } = args;

  return {
    firstLiveAt:
      firstLiveAt ??
      (currentStatus !== "live" && nextStatus === "live" ? now : firstLiveAt),
    finishedAt:
      finishedAt ??
      (currentStatus !== "finished" && nextStatus === "finished" ? now : finishedAt),
  };
}

function shouldMarkArchived(finishedAt: Date | null | undefined, now: Date): boolean {
  if (!finishedAt) return false;
  return now.getTime() - finishedAt.getTime() > RECENT_RESULTS_RETENTION_MS;
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
  const [oddsUpdates, scoresUpdates] = await Promise.all([
    getTxlineOddsUpdatesResult(fixtureId),
    getTxlineScoresUpdatesResult(fixtureId),
  ]);

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

function normalizeProviderStatus(raw: any): string {
  const gameState = raw?.GameState;

  if (gameState != null) {
    if (typeof gameState === "number") {
      const mapped = {
        0: "pre",
        1: "live",
        2: "halftime",
        3: "finished",
      } as const;

      return mapped[gameState as keyof typeof mapped] ?? `state_${gameState}`;
    }

    if (typeof gameState === "string") {
      const normalized = gameState.toLowerCase().replace(/^state_/, "").trim();
      const stringMapped: Record<string, string> = {
        pre: "pre",
        scheduled: "pre",
        upcoming: "pre",
        notstarted: "pre",
        not_started: "pre",
        live: "live",
        inplay: "live",
        in_play: "live",
        halftime: "halftime",
        half_time: "halftime",
        finished: "finished",
        fulltime: "finished",
        full_time: "finished",
        ended: "finished",
      };
      return stringMapped[normalized] ?? `state_${gameState}`;
    }
  }

  const status = typeof raw?.Status === "string" ? raw.Status : typeof raw?.status === "string" ? raw.status : "";
  if (status) {
    const normalized = status.toLowerCase().replace(/^state_/, "").trim();
    const stringMapped: Record<string, string> = {
      pre: "pre",
      scheduled: "pre",
      upcoming: "pre",
      notstarted: "pre",
      not_started: "pre",
      live: "live",
      inplay: "live",
      in_play: "live",
      halftime: "halftime",
      half_time: "halftime",
      finished: "finished",
      fulltime: "finished",
      full_time: "finished",
      ended: "finished",
    };
    return stringMapped[normalized] ?? `state_${status}`;
  }

  return "pre";
}

function resolveFixtureStatus(candidates: Array<string | null | undefined>): string {
  const priority = ["live", "halftime", "finished", "pre"] as const;

  for (const status of priority) {
    const matched = candidates.find((candidate) => candidate === status);
    if (matched) return status;
  }

  return "pre";
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
  const providerStatus = normalizeProviderStatus(f);
  const monitoringState = computeMonitoringState({
    providerStatus,
    kickoffTs,
    nowTs,
    feedEmptyCount: 0,
  });
  // Defensive guard: don't mark a newly discovered fixture as `live` if its
  // kickoff is still far in the future. A provider feed glitch may briefly
  // advertise a fixture as live; require kickoff to be within a short window
  // before allowing a bulk-upsert to create a `live` monitoring state.
  const MS_ALLOW_LIVE_BEFORE_KICKOFF = 5 * 60 * 1000; // 5 minutes
  const msToKickoff = kickoffTs - nowTs;
  let adjustedMonitoringState = monitoringState;
  if (monitoringState === "live" && msToKickoff > MS_ALLOW_LIVE_BEFORE_KICKOFF) {
    adjustedMonitoringState = "prematch_monitoring";
    logger.info(
      {
        fixtureId: Number(f.FixtureId),
        providerStatus,
        StartTime: f.StartTime ?? f.KickoffTs,
        GameState: f.GameState ?? f.Status,
        msToKickoff,
      },
      "txline poller: suppressed early 'live' on bulk upsert; logged provider snapshot"
    );
  }
  const fixtureId = Number(f.FixtureId);
  const competition = String(f.Competition ?? f.CompetitionName ?? "Unknown");
  const participant1 = String(f.Participant1 ?? "Home");
  const participant2 = String(f.Participant2 ?? "Away");
  const isParticipant1Home = f.Participant1IsHome !== false;
  const homeTeam = isParticipant1Home ? participant1 : participant2;
  const awayTeam = isParticipant1Home ? participant2 : participant1;

  try {
    const [existing] = await db
      .select({
        status: fixturesTable.status,
        monitoringState: fixturesTable.monitoringState,
        firstLiveAt: fixturesTable.firstLiveAt,
        finishedAt: fixturesTable.finishedAt,
      })
      .from(fixturesTable)
      .where(eq(fixturesTable.fixtureId, fixtureId))
      .limit(1);

    const existingMonitoringState = existing?.monitoringState != null ? String(existing.monitoringState) : null;
    // Never let the coarse bulk-list recompute override a state pollFixture()
    // already established. Only brand-new fixtures (existingMonitoringState
    // === null) get their monitoringState set here.
    const nextMonitoringState = existingMonitoringState ?? adjustedMonitoringState;

    const transitionFields = deriveLifecycleTransitionFields({
      currentStatus: existing?.status != null ? String(existing.status) : "pre",
      nextStatus: providerStatus,
      firstLiveAt: existing?.firstLiveAt,
      finishedAt: existing?.finishedAt,
      now,
    });

    if (existingMonitoringState !== nextMonitoringState && nextMonitoringState === "prematch_monitoring") {
      logger.info(
        { fixtureId, from: existingMonitoringState, to: nextMonitoringState },
        "txline poller: fixture entered prematch_monitoring"
      );
    }

    await db
      .insert(fixturesTable)
      .values({
        fixtureId,
        competition,
        homeTeam,
        awayTeam,
        kickoffTs,
        status: providerStatus,
        monitoringState: nextMonitoringState,
        feedHealth: "unknown",
        lastFixtureSyncAt: now,
        lastSuccessfulIngestAt: null,
        lastIngestError: null,
        firstLiveAt: transitionFields.firstLiveAt,
        finishedAt: transitionFields.finishedAt,
      })
      .onConflictDoUpdate({
        target: fixturesTable.fixtureId,
        set: {
          competition,
          homeTeam,
          awayTeam,
          kickoffTs,
          status: providerStatus,
          monitoringState: nextMonitoringState,
          lastFixtureSyncAt: now,
          firstLiveAt: transitionFields.firstLiveAt,
          finishedAt: transitionFields.finishedAt,
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

async function insertScoreEvents(fixtureId: number, scores: any[]) {
  if (!Array.isArray(scores) || scores.length === 0) return 0;
  let count = 0;
  for (const score of scores) {
    try {
      const rec = score as Record<string, unknown>;
      const ts = (rec["Ts"] as number | undefined) ?? Date.now();
      const minute =
        typeof rec["Minute"] === "number"
          ? rec["Minute"]
          : typeof rec["minute"] === "number"
            ? rec["minute"]
            : 0;
      const eventType = String(rec["EventType"] ?? rec["eventType"] ?? rec["Type"] ?? rec["type"] ?? "score_update");
      const participant = String(rec["Participant"] ?? rec["participant"] ?? rec["Team"] ?? rec["team"] ?? "match");

      await db.insert(scoreEventsTable).values({
        fixtureId,
        ts,
        minute: Number(minute) || 0,
        eventType,
        participant,
        meta: rec,
      });
      count++;
    } catch {
      // ignore per-item errors
    }
  }
  return count;
}

async function pollFixture(fixtureId: number): Promise<void> {
  const pollStartedAt = Date.now();
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
          .set({
            lastSuccessfulIngestAt: now,
            lastIngestError: null,
          })
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
        if (shouldMarkArchived(fixture.finishedAt, now)) {
          const nextArchivedAt = fixture.archivedAt ?? now;

          if (!fixture.archivedAt) {
            logger.info({ fixtureId }, "txline poller: fixture became archived");
          }

          await db
            .update(fixturesTable)
            .set({
              monitoringState: "archived",
              archivedAt: nextArchivedAt,
            })
            .where(eq(fixturesTable.fixtureId, fixtureId));
          return;
        }

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
      // Sort ascending by provider timestamp first so the last write in the
      // array is the most recent provider event when applied in sequence.
      scores.sort((a, b) => {
        const ta = Number(a?.Ts ?? a?.ts ?? a?.Timestamp ?? 0) || 0;
        const tb = Number(b?.Ts ?? b?.ts ?? b?.Timestamp ?? 0) || 0;
        return ta - tb;
      });

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
        const providerStatus = normalizeProviderStatus(score);

        if (home != null) scoreUpdate.homeScore = home as number;
        if (away != null) scoreUpdate.awayScore = away as number;
        if (minute != null) scoreUpdate.minutePlayed = minute as number;
        if (providerStatus !== "pre") scoreUpdate.status = providerStatus;
      }
    } catch {
      // ignore per-item score parsing errors
    }
  }

  const effectiveStatus = resolveFixtureStatus([
    typeof scoreUpdate.status === "string" ? scoreUpdate.status : null,
    fixture.status != null ? String(fixture.status) : null,
  ]);

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
    await insertScoreEvents(fixtureId, scores);
    await upsertEvents(fixtureId, "scores", scores);
  }
  const nextMonitoringState = computeMonitoringState({
    providerStatus: effectiveStatus,
    kickoffTs: Number(fixture.kickoffTs),
    nowTs: now.getTime(),
    feedEmptyCount: nextEmptyCount,
  });

  const transitionFields = deriveLifecycleTransitionFields({
    currentStatus: String(fixture.status),
    nextStatus: effectiveStatus,
    firstLiveAt: fixture.firstLiveAt,
    finishedAt: fixture.finishedAt,
    now,
  });

  // Defensive evidence check: require some in-play evidence before flipping to
  // `live` if kickoff is still well in the future. Evidence includes a played
  // minute or an odds payload explicitly indicating `InRunning`.
  let adjustedNextMonitoringState = nextMonitoringState;
  const msToKickoff = Number(fixture.kickoffTs) - now.getTime();
  const hasMinutePlayed = (Number(scoreUpdate.minutePlayed) || 0) > 0 || scores.some((s) => {
    const m = Number((s && (s.Minute ?? s.minute)) as any) || 0;
    return m > 0;
  });
  const hasInRunningFlag = odds.some((o) => {
    if (!o) return false;
    const v = o.InRunning ?? o.inRunning ?? o.in_running ?? o.InRunningFlag;
    if (v === true || v === 1) return true;
    if (typeof v === "string") return v.toLowerCase() === "true" || v === "1";
    return false;
  });

  if (
    adjustedNextMonitoringState === "live" &&
    msToKickoff > MS_ALLOW_LIVE_BEFORE_KICKOFF &&
    !hasMinutePlayed &&
    !hasInRunningFlag
  ) {
    logger.warn(
      { fixtureId, msToKickoff, hasMinutePlayed, hasInRunningFlag },
      "txline poller: suppressing early 'live' flip due to lack of in-play evidence"
    );
    adjustedNextMonitoringState = "prematch_monitoring";
  }

  const nextArchivedAt =
    effectiveStatus === "finished" && shouldMarkArchived(transitionFields.finishedAt ?? fixture.finishedAt, now)
      ? fixture.archivedAt ?? now
      : fixture.archivedAt;

  const finalMonitoringState = nextArchivedAt != null ? "archived" : adjustedNextMonitoringState;

  if (fixture.monitoringState !== finalMonitoringState) {
    if (finalMonitoringState === "prematch_monitoring") {
      logger.info(
        { fixtureId, from: fixture.monitoringState, to: finalMonitoringState },
        "txline poller: fixture entered prematch_monitoring"
      );
    } else if (finalMonitoringState === "live") {
      logger.info(
        { fixtureId, from: fixture.monitoringState, to: finalMonitoringState },
        "txline poller: fixture entered live"
      );
    } else if (finalMonitoringState === "finished") {
      logger.info(
        { fixtureId, from: fixture.monitoringState, to: finalMonitoringState },
        "txline poller: fixture entered finished"
      );
    } else if (finalMonitoringState === "archived") {
      logger.info(
        { fixtureId, from: fixture.monitoringState, to: finalMonitoringState },
        "txline poller: fixture became archived"
      );
    }
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

  // Real feed latency: how long this poll's provider round trip actually took.
  const nextFeedLatencyMs = Date.now() - pollStartedAt;

  // Real edge score: pull the most recent Orchestrator verdict for this fixture,
  // if one has been computed, instead of leaving the column null forever.
  const [latestOrchestratorSignal] = await db
    .select()
    .from(agentSignalsTable)
    .where(
      and(
        eq(agentSignalsTable.fixtureId, fixtureId),
        eq(agentSignalsTable.agentName, "Orchestrator"),
      ),
    )
    .orderBy(desc(agentSignalsTable.ts))
    .limit(1);

  const orchestratorPayload = latestOrchestratorSignal?.payload as { edgeScore?: number } | null;
  const nextEdgeScore =
    typeof orchestratorPayload?.edgeScore === "number"
      ? orchestratorPayload.edgeScore
      : (fixture.currentEdgeScore ?? null);

  await db
    .update(fixturesTable)
    .set({
      ...scoreUpdate,
      monitoringState: finalMonitoringState,
      feedHealth: usedFallback && nextFeedHealth === "healthy" ? "degraded" : nextFeedHealth,
      feedEmptyCount: nextEmptyCount,
      lastSuccessfulIngestAt: now,
      lastIngestError: null,
      lastOddsSyncAt: odds.length > 0 ? now : fixture.lastOddsSyncAt,
      lastScoresSyncAt: scores.length > 0 ? now : fixture.lastScoresSyncAt,
      lastOddsCursor: fixture.lastOddsCursor,
      lastScoresCursor: fixture.lastScoresCursor,
      firstLiveAt: transitionFields.firstLiveAt,
      finishedAt: transitionFields.finishedAt,
      archivedAt: nextArchivedAt,
      feedLatencyMs: nextFeedLatencyMs,
      currentEdgeScore: nextEdgeScore,
    })
    .where(eq(fixturesTable.fixtureId, fixtureId));
}

async function runPollCycle(): Promise<void> {
  if (pollCycleRunning) return;
  pollCycleRunning = true;
  pollerRuntimeState.lastCycleStartedAt = new Date().toISOString();
  pollerRuntimeState.lastCycleError = null;

  try {
    const fixtures = await getTxlineFixtures();
    if (!Array.isArray(fixtures) || fixtures.length === 0) {
      pollerRuntimeState.lastCycleSucceeded = true;
      return;
    }

    for (const fixture of fixtures) {
      await upsertFixtureRecord(fixture);
    }

    const POLL_CONCURRENCY = 5;

    async function pollFixturesConcurrently(fixtureIds: number[]): Promise<void> {
      for (let i = 0; i < fixtureIds.length; i += POLL_CONCURRENCY) {
        const batch = fixtureIds.slice(i, i + POLL_CONCURRENCY);
        await Promise.all(batch.map((id) => pollFixture(id)));
      }
    }

    await pollFixturesConcurrently(fixtures.map((f) => Number(f.FixtureId)));
    pollerRuntimeState.lastCycleSucceeded = true;
  } catch (err) {
    pollerRuntimeState.lastCycleSucceeded = false;
    pollerRuntimeState.lastCycleError =
      err instanceof Error ? err.message : "Unknown poll cycle error";
    logger.warn({ err }, "txline poller: cycle failed");
    throw err;
  } finally {
    pollerRuntimeState.lastCycleFinishedAt = new Date().toISOString();
    pollCycleRunning = false;
  }
}

export function startTxlinePoller(): void {
  if (pollerActive) return;
  if (!process.env.TXLINE_API_TOKEN) {
    logger.warn("TXLINE_API_TOKEN not set — TxLINE DVR poller skipped");
    pollerRuntimeState.active = false;
    pollerRuntimeState.startedAt = null;
    pollerRuntimeState.lastCycleStartedAt = null;
    pollerRuntimeState.lastCycleFinishedAt = null;
    pollerRuntimeState.lastCycleSucceeded = null;
    pollerRuntimeState.lastCycleError = "TXLINE_API_TOKEN not set";
    return;
  }

  pollerActive = true;
  pollerRuntimeState.active = true;
  pollerRuntimeState.startedAt = new Date().toISOString();
  pollerRuntimeState.lastCycleError = null;
  logger.info(
    "TxLINE DVR poller started after server listen; runtime liveness is available at /health and host sleep will still pause background ingestion",
  );

  const schedule = () => {
    pollerTimer = setTimeout(async () => {
      if (!pollerActive) return;
      try {
        await runPollCycle();
      } catch {
        // The cycle logger and runtime state already capture the failure.
      } finally {
        if (pollerActive) schedule();
      }
    }, BASE_POLL_INTERVAL_MS);
  };

  void (async () => {
    try {
      await runPollCycle();
    } catch {
      // The cycle logger and runtime state already capture the failure.
    } finally {
      if (pollerActive) schedule();
    }
  })();
}

export function stopTxlinePoller(): void {
  pollerActive = false;
  pollerRuntimeState.active = false;
  if (pollerTimer) {
    clearTimeout(pollerTimer);
    pollerTimer = null;
  }
  logger.info("TxLINE DVR poller stopped");
}
