import { logger } from "./lib/logger";

const TXLINE_ORIGIN = "https://txline-dev.txodds.com";
const TXLINE_API_BASE = `${TXLINE_ORIGIN}/api`;

interface TxlineFixture {
  FixtureId: number;
  Participant1: string;
  Participant2: string;
  Participant1IsHome: boolean;
  StartTime: number | string;
  CompetitionId: number;
  Competition?: string;
  CompetitionName?: string;
  Status?: string;
  GameState?: number;
  Ts?: number;
  [key: string]: unknown;
}

interface TxlineOddsEntry {
  FixtureId: number;
  Market?: string;
  Selection?: string;
  Price?: number;
  Spread?: number;
  Timestamp?: number;
  [key: string]: unknown;
}

interface TxlineScoreEntry {
  FixtureId: number;
  HomeScore?: number;
  AwayScore?: number;
  Minute?: number;
  [key: string]: unknown;
}

let cachedJwt: string | null = null;
let jwtExpiresAt = 0;

async function getGuestJwt(): Promise<string> {
  if (cachedJwt && Date.now() < jwtExpiresAt) {
    return cachedJwt;
  }

  const response = await fetch(`${TXLINE_ORIGIN}/auth/guest/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new Error(`TxLINE guest auth failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { token: string };
  cachedJwt = data.token;
  jwtExpiresAt = Date.now() + 55 * 60 * 1000;
  return cachedJwt;
}

async function txlineRequest<T>(path: string, retried = false): Promise<T> {
  const apiToken = process.env.TXLINE_API_TOKEN;
  if (!apiToken) {
    throw new Error("TXLINE_API_TOKEN is not configured");
  }

  const jwt = await getGuestJwt();

  const response = await fetch(`${TXLINE_API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${jwt}`,
      "X-Api-Token": apiToken,
    },
  });

  if (response.status === 401 && !retried) {
    cachedJwt = null;
    return txlineRequest<T>(path, true);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`TxLINE API error ${response.status}: ${text.slice(0, 200)}`);
  }

  return response.json() as Promise<T>;
}

export async function testTxlineConnection(): Promise<{
  connected: boolean;
  fixtureCount: number;
  error?: string;
}> {
  try {
    const fixtures = await txlineRequest<TxlineFixture[]>("/fixtures/snapshot");
    return { connected: true, fixtureCount: Array.isArray(fixtures) ? fixtures.length : 0 };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err: message }, "TxLINE connection test failed");
    return { connected: false, fixtureCount: 0, error: message };
  }
}

export async function getTxlineFixtures(competitionId?: number): Promise<TxlineFixture[]> {
  const params = competitionId ? `?competitionId=${competitionId}` : "";
  return txlineRequest<TxlineFixture[]>(`/fixtures/snapshot${params}`);
}

export async function getTxlineOdds(fixtureId: number): Promise<TxlineOddsEntry[]> {
  return txlineRequest<TxlineOddsEntry[]>(`/odds/snapshot/${fixtureId}`);
}

export async function getTxlineScores(fixtureId: number): Promise<TxlineScoreEntry[]> {
  return txlineRequest<TxlineScoreEntry[]>(`/scores/snapshot/${fixtureId}`);
}
