import { db } from "@workspace/db";
import { txlineEventsTable, fixturesTable, oddsSnapshotsTable } from "@workspace/db";
import { getTxlineFixtures, getTxlineOdds, getTxlineScores } from "./txline-client";
import { logger } from "./lib/logger";

const POLL_INTERVAL_MS = 5000;
let pollerActive = false;
let pollerTimer: ReturnType<typeof setTimeout> | null = null;

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

async function upsertFixtureRecord(f: any) {
  const fixtureId = f.FixtureId;
  const homeTeam = f.Participant1IsHome ? f.Participant1 : f.Participant2;
  const awayTeam = f.Participant1IsHome ? f.Participant2 : f.Participant1;
  const kickoffTs = typeof f.StartTime === 'number' ? f.StartTime : Date.parse(String(f.StartTime));
  const competition = f.Competition ?? f.CompetitionName ?? "";
  const status = f.GameState != null ? ( {0: 'pre',1: 'live',2: 'halftime',3: 'finished'}[f.GameState] ?? `state_${f.GameState}` ) : (f.Status ?? 'pre');

  try {
    await db.insert(fixturesTable).values({ fixtureId, competition, homeTeam, awayTeam, kickoffTs, status }).onConflictDoNothing();
    await db.update(fixturesTable).set({ competition, homeTeam, awayTeam, kickoffTs, status }).where(fixturesTable.fixtureId.eq(fixtureId));
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
  try {
    const [oddsRaw, scoresRaw] = await Promise.allSettled([
      getTxlineOdds(fixtureId),
      getTxlineScores(fixtureId),
    ]);

    if (oddsRaw.status === "fulfilled" && Array.isArray(oddsRaw.value)) {
      await upsertEvents(fixtureId, "odds", oddsRaw.value);
      await insertOddsSnapshots(fixtureId, oddsRaw.value as any[]);
    }

    if (scoresRaw.status === "fulfilled") {
      const scores = Array.isArray(scoresRaw.value) ? scoresRaw.value : await safeParse(String(scoresRaw.value)).then(r => r);
      await upsertEvents(fixtureId, "scores", scores);
      try {
        for (const s of scores as any[]) {
          const home = typeof s.HomeScore === 'number' ? s.HomeScore : (s.homeScore ?? null);
          const away = typeof s.AwayScore === 'number' ? s.AwayScore : (s.awayScore ?? null);
          const minute = typeof s.Minute === 'number' ? s.Minute : (s.minute ?? null);
          const status = s.GameState != null ? (s.GameState === 1 ? 'live' : s.GameState === 3 ? 'finished' : null) : null;
          const update: any = {};
          if (home != null) update.homeScore = home;
          if (away != null) update.awayScore = away;
          if (minute != null) update.minutePlayed = minute;
          if (status) update.status = status;
          if (Object.keys(update).length) {
            await db.update(fixturesTable).set(update).where(fixturesTable.fixtureId.eq(fixtureId));
          }
        }
      } catch (err) {
        // ignore per-item update errors
      }
    }
  } catch (err) {
    logger.warn({ err, fixtureId }, "txline poller: fixture poll failed");
  }
}

async function runPollCycle(): Promise<void> {
  try {
    const fixtures = await getTxlineFixtures();
    if (!Array.isArray(fixtures) || fixtures.length === 0) return;

    await Promise.allSettled(fixtures.map((f) => upsertFixtureRecord(f)));

    await Promise.allSettled(
      fixtures.map((f) => pollFixture(f.FixtureId))
    );
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
