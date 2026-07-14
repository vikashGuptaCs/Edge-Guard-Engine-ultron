import {
  db,
  pool,
  fixturesTable,
  oddsSnapshotsTable,
  scoreEventsTable,
  agentSignalsTable,
  alertsTable,
  riskMetricsTable,
  txlineEventsTable,
} from "@workspace/db";

function ms(iso: string) {
  return Date.parse(iso);
}

function round4(n: number) {
  return Math.round(n * 10_000) / 10_000;
}

function genLadder(args: {
  fixtureId: number;
  kickoffTs: number;
  selection: string;
  basePrice: number;
  drift: number;
  volatility: number;
  spreadBase: number;
  spreadAmp: number;
}) {
  const { fixtureId, kickoffTs, selection, basePrice, drift, volatility, spreadBase, spreadAmp } = args;
  const rows: Array<{
    fixtureId: number;
    ts: number;
    market: string;
    selection: string;
    stablePrice: string;
    spread: string;
    volume: string;
  }> = [];

  for (let minute = -15; minute <= 105; minute += 5) {
    const ts = kickoffTs + minute * 60_000;
    const x = (minute + 15) / 120;
    const noise = Math.sin(minute / 7) * volatility + Math.cos(minute / 11) * (volatility / 2);
    const stablePrice = round4(Math.max(1.01, basePrice + drift * x + noise));
    const spread = round4(Math.max(0.01, spreadBase + Math.abs(Math.sin(minute / 9)) * spreadAmp));
    const volume = round4(10_000 + (minute + 15) * 420 + Math.abs(Math.sin(minute / 5)) * 750);

    rows.push({
      fixtureId,
      ts,
      market: "1x2",
      selection,
      stablePrice: String(stablePrice),
      spread: String(spread),
      volume: String(volume),
    });
  }

  return rows;
}

async function main() {
  const fixtures = [
    {
      fixtureId: 9_000_001,
      competition: "UEFA Champions League",
      homeTeam: "Borussia Dortmund",
      awayTeam: "Real Madrid",
      kickoffTs: ms("2024-06-01T19:00:00.000Z"),
      status: "finished",
      monitoringState: "finished",
      homeScore: 0,
      awayScore: 2,
      minutePlayed: 90,
      scoreEvents: [
        { minute: 0, participant: "match", eventType: "kickoff", meta: { label: "KO" } },
        { minute: 74, participant: "Real Madrid", eventType: "goal", meta: { scorer: "Dani Carvajal" } },
        { minute: 83, participant: "Real Madrid", eventType: "goal", meta: { scorer: "Vinícius Júnior" } },
        { minute: 90, participant: "match", eventType: "full_time", meta: { label: "FT", score: "0-2" } },
      ],
      odds: genLadder({
        fixtureId: 9_000_001,
        kickoffTs: ms("2024-06-01T19:00:00.000Z"),
        selection: "away",
        basePrice: 2.25,
        drift: -0.25,
        volatility: 0.05,
        spreadBase: 0.05,
        spreadAmp: 0.08,
      }),
    },
    {
      fixtureId: 9_000_002,
      competition: "UEFA EURO",
      homeTeam: "Spain",
      awayTeam: "England",
      kickoffTs: ms("2024-07-14T19:00:00.000Z"),
      status: "finished",
      monitoringState: "finished",
      homeScore: 2,
      awayScore: 1,
      minutePlayed: 90,
      scoreEvents: [
        { minute: 0, participant: "match", eventType: "kickoff", meta: { label: "KO" } },
        { minute: 47, participant: "Spain", eventType: "goal", meta: { scorer: "Nico Williams" } },
        { minute: 73, participant: "England", eventType: "goal", meta: { scorer: "Cole Palmer" } },
        { minute: 86, participant: "Spain", eventType: "goal", meta: { scorer: "Mikel Oyarzabal" } },
        { minute: 90, participant: "match", eventType: "full_time", meta: { label: "FT", score: "2-1" } },
      ],
      odds: genLadder({
        fixtureId: 9_000_002,
        kickoffTs: ms("2024-07-14T19:00:00.000Z"),
        selection: "home",
        basePrice: 2.05,
        drift: -0.15,
        volatility: 0.06,
        spreadBase: 0.06,
        spreadAmp: 0.07,
      }),
    },
  ] as const;

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.delete(alertsTable);
    await tx.delete(agentSignalsTable);
    await tx.delete(riskMetricsTable);
    await tx.delete(scoreEventsTable);
    await tx.delete(oddsSnapshotsTable);
    await tx.delete(txlineEventsTable);
    await tx.delete(fixturesTable);

    await tx.insert(fixturesTable).values(
      fixtures.map((f) => ({
        fixtureId: f.fixtureId,
        competition: f.competition,
        homeTeam: f.homeTeam,
        awayTeam: f.awayTeam,
        kickoffTs: f.kickoffTs,
        status: f.status,
        monitoringState: f.monitoringState,
        feedHealth: "unknown",
        feedEmptyCount: 0,
        homeScore: f.homeScore,
        awayScore: f.awayScore,
        minutePlayed: f.minutePlayed,
        feedLatencyMs: 42,
        lastSuccessfulIngestAt: now,
        finishedAt: now,
      })),
    );

    await tx.insert(oddsSnapshotsTable).values(fixtures.flatMap((f) => f.odds));

    await tx.insert(scoreEventsTable).values(
      fixtures.flatMap((f) =>
        f.scoreEvents.map((e) => ({
          fixtureId: f.fixtureId,
          ts: f.kickoffTs + e.minute * 60_000,
          minute: e.minute,
          eventType: e.eventType,
          participant: e.participant,
          meta: e.meta,
        })),
      ),
    );

    await tx.insert(agentSignalsTable).values(
      fixtures.map((f) => ({
        fixtureId: f.fixtureId,
        ts: f.kickoffTs + 60 * 60_000,
        agentName: "demo-agent",
        signalType: "EXECUTE",
        confidence: "0.8421",
        payload: { source: "seed", note: "synthetic signal for demo timeline" },
      })),
    );

    await tx.insert(alertsTable).values(
      fixtures.map((f) => ({
        fixtureId: f.fixtureId,
        ts: f.kickoffTs + 60 * 60_000,
        edgeScore: 82,
        narration: "Seeded demo alert",
        action: "EXECUTE",
        fired: true,
        lifecycleState: f.monitoringState,
        feedHealth: "unknown",
        confidenceBand: "high",
      })),
    );
  });

  await pool?.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool?.end();
  process.exit(1);
});
