import { db } from "@workspace/db";
import { txlineEventsTable, fixturesTable, oddsSnapshotsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getTxlineFixtures, getTxlineOdds, getTxlineScores } from "./txline-client";
import { logger } from "./lib/logger";

const POLL_INTERVAL_MS = 5000;
let pollerActive = false;
let pollerTimer: ReturnType<typeof setTimeout> | null = null;

type FixtureLifecycleState =
  | "discovered"
  | "upcoming"
  | "prematch_monitoring"
  | "live"
  | "halftime"
  | "finished"
  | "archived";

type FeedHealthState = "unknown" | "healthy" | "degraded" | "empty" | "error";

async function safeParse(text: string): Promise<unknown[]> {
  const trimmed = text.trim();
  if (!trimmed || trimmed === '""' || trimmed === "") return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

  const now = new Date();
  let odds: any[] = [];
  let scores: any[] = [];
  let hadError = false;

  try {
    if (fixture.monitoringState === "discovered") {
      await db
        .update(fixturesTable)
        .set({
          lastSuccessfulIngestAt: now,
          feedHealth: "unknown",
        })
        .where(eq(fixturesTable.fixtureId, fixtureId));
      return;
    }

    if (
      fixture.monitoringState === "upcoming" ||
      fixture.monitoringState === "prematch_monitoring" ||
      fixture.monitoringState === "live" ||
      fixture.monitoringState === "halftime"
    ) {
      // TODO(phase-3): switch live fixtures to explicit updates-result methods with snapshot fallback.
      const oddsResult = await getTxlineOdds(fixtureId);
      const scoresResult = await getTxlineScores(fixtureId);
      odds = Array.isArray(oddsResult) ? oddsResult : ((await safeParse(String(oddsResult))) as any[]);
      scores = Array.isArray(scoresResult)
        ? scoresResult
        : ((await safeParse(String(scoresResult))) as any[]);
    }
  } catch (err) {
    hadError = true;

    await db
      .update(fixturesTable)
      .set({
        feedHealth: "error",
        lastIngestError: err instanceof Error ? err.message : "Unknown ingest error",
      })
      .where(eq(fixturesTable.fixtureId, fixtureId));

    logger.warn({ err, fixtureId }, "txline poller: fixture poll failed");
    return;
  }

  const totalItems = odds.length + scores.length;
  const nextEmptyCount = totalItems === 0 ? (fixture.feedEmptyCount ?? 0) + 1 : 0;
  const nextFeedHealth = computeFeedHealth({
    status: String(fixture.status),
    oddsCount: odds.length,
    scoresCount: scores.length,
    feedEmptyCount: nextEmptyCount,
    hadError,
  });

  if (odds.length > 0) {
    await upsertEvents(fixtureId, "odds", odds);
    await insertOddsSnapshots(fixtureId, odds);
  }

  if (scores.length > 0) {
    await upsertEvents(fixtureId, "scores", scores);
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
  const nextMonitoringState = computeMonitoringState({
    providerStatus: effectiveStatus,
    kickoffTs: Number(fixture.kickoffTs),
    nowTs: now.getTime(),
    feedEmptyCount: nextEmptyCount,
  });

  await db
    .update(fixturesTable)
    .set({
      ...scoreUpdate,
      monitoringState: nextMonitoringState,
      feedHealth: nextFeedHealth,
      feedEmptyCount: nextEmptyCount,
      lastSuccessfulIngestAt: now,
      lastIngestError: null,
      firstLiveAt:
        fixture.firstLiveAt ?? (effectiveStatus === "live" ? now : fixture.firstLiveAt),
      finishedAt:
        effectiveStatus === "finished" && !fixture.finishedAt ? now : fixture.finishedAt,
    })
    .where(eq(fixturesTable.fixtureId, fixtureId));
}

async function runPollCycle(): Promise<void> {
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
    }, POLL_INTERVAL_MS);
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
