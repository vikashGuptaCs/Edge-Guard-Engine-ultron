import { logger } from "./lib/logger";

const TXLINE_ORIGIN = "https://txline-dev.txodds.com";
const TXLINE_API_BASE = `${TXLINE_ORIGIN}/api`;

type TxlinePayloadKind = "array" | "object" | "empty" | "invalid_json";

type TxlineResultCategory =
  | "success"
  | "empty_valid"
  | "auth_error"
  | "transport_error"
  | "endpoint_error"
  | "parse_error";

export interface TxlineRequestMeta {
  endpoint: string;
  statusCode: number;
  receivedAt: string;
  payloadKind: TxlinePayloadKind;
  itemCount: number;
  category: TxlineResultCategory;
}

export interface TxlineArrayResult<T> {
  data: T[];
  meta: TxlineRequestMeta;
}

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

function normalizeTxlineArrayPayload<T>(
  rawText: string,
  endpoint: string,
  statusCode: number
): TxlineArrayResult<T> {
  const receivedAt = new Date().toISOString();
  const text = rawText.trim();

  if (!text || text === '""') {
    return {
      data: [],
      meta: {
        endpoint,
        statusCode,
        receivedAt,
        payloadKind: "empty",
        itemCount: 0,
        category: "empty_valid",
      },
    };
  }

  const candidates = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      if (line.startsWith("data:")) {
        const payload = line.slice(5).trim();
        return payload ? [payload] : [];
      }

      if (line.startsWith("{" ) || line.startsWith("[")) {
        return [line];
      }

      return [];
    });

  if (candidates.length === 0) {
    return {
      data: [],
      meta: {
        endpoint,
        statusCode,
        receivedAt,
        payloadKind: "empty",
        itemCount: 0,
        category: "empty_valid",
      },
    };
  }

  try {
    const parsedItems: unknown[] = [];

    for (const candidate of candidates) {
      const parsed = JSON.parse(candidate);

      if (Array.isArray(parsed)) {
        parsedItems.push(...parsed);
      } else if (parsed != null) {
        parsedItems.push(parsed);
      }
    }

    if (parsedItems.length === 0) {
      return {
        data: [],
        meta: {
          endpoint,
          statusCode,
          receivedAt,
          payloadKind: "empty",
          itemCount: 0,
          category: "empty_valid",
        },
      };
    }

    return {
      data: parsedItems as T[],
      meta: {
        endpoint,
        statusCode,
        receivedAt,
        payloadKind: parsedItems.length === 1 ? "object" : "array",
        itemCount: parsedItems.length,
        category: parsedItems.length === 0 ? "empty_valid" : "success",
      },
    };
  } catch {
    return {
      data: [],
      meta: {
        endpoint,
        statusCode,
        receivedAt,
        payloadKind: "invalid_json",
        itemCount: 0,
        category: "parse_error",
      },
    };
  }
}

function unwrapTxlineArrayResult<T>(result: TxlineArrayResult<T>): T[] {
  if (result.meta.category === "success" || result.meta.category === "empty_valid") {
    return result.data;
  }

  throw new Error(
    `TxLINE request failed with category ${result.meta.category} at ${result.meta.endpoint}`
  );
}

export async function getGuestJwt(): Promise<string> {
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

async function txlineArrayRequest<T>(path: string, retried = false): Promise<TxlineArrayResult<T>> {
  const endpoint = path;
  const apiToken = process.env.TXLINE_API_TOKEN;
  if (!apiToken) {
    logger.warn({ endpoint }, "TxLINE request auth error: TXLINE_API_TOKEN missing");
    return {
      data: [],
      meta: {
        endpoint,
        statusCode: 0,
        receivedAt: new Date().toISOString(),
        payloadKind: "empty",
        itemCount: 0,
        category: "auth_error",
      },
    };
  }

  let jwt: string;
  try {
    jwt = await getGuestJwt();
  } catch (error) {
    logger.warn({ err: error, endpoint }, "TxLINE request auth error");
    return {
      data: [],
      meta: {
        endpoint,
        statusCode: 0,
        receivedAt: new Date().toISOString(),
        payloadKind: "empty",
        itemCount: 0,
        category: "auth_error",
      },
    };
  }

  let response: Response;
  try {
    response = await fetch(`${TXLINE_API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Api-Token": apiToken,
      },
    });
  } catch (error) {
    logger.warn({ err: error, endpoint }, "TxLINE transport error");
    return {
      data: [],
      meta: {
        endpoint,
        statusCode: 0,
        receivedAt: new Date().toISOString(),
        payloadKind: "empty",
        itemCount: 0,
        category: "transport_error",
      },
    };
  }

  if (response.status === 401 && !retried) {
    cachedJwt = null;
    jwtExpiresAt = 0;
    logger.warn({ endpoint }, "TxLINE auth retry after 401");
    return txlineArrayRequest<T>(path, true);
  }

  const text = await response.text();

  if (!response.ok) {
    const category = response.status === 401 ? "auth_error" : "endpoint_error";
    logger.warn(
      { endpoint, statusCode: response.status, bodyPreview: text.slice(0, 200), category },
      "TxLINE endpoint error"
    );
    return {
      data: [],
      meta: {
        endpoint,
        statusCode: response.status,
        receivedAt: new Date().toISOString(),
        payloadKind: "empty",
        itemCount: 0,
        category,
      },
    };
  }

  const result = normalizeTxlineArrayPayload<T>(text, endpoint, response.status);

  if (result.meta.category === "parse_error") {
    logger.warn(
      { endpoint, statusCode: response.status, bodyPreview: text.slice(0, 200) },
      "TxLINE parse error"
    );
  } else if (result.meta.category === "empty_valid") {
    logger.debug({ endpoint, statusCode: response.status }, "TxLINE empty-but-valid response");
  }

  return result;
}

export async function testTxlineConnection(): Promise<{
  connected: boolean;
  fixtureCount: number;
  category?: TxlineResultCategory;
  statusCode?: number;
  error?: string;
}> {
  const result = await getTxlineFixturesSnapshotResult();

  if (result.meta.category === "success" || result.meta.category === "empty_valid") {
    return {
      connected: true,
      fixtureCount: result.data.length,
      category: result.meta.category,
      statusCode: result.meta.statusCode,
    };
  }

  logger.warn(
    { category: result.meta.category, statusCode: result.meta.statusCode },
    "TxLINE connection test failed"
  );
  return {
    connected: false,
    fixtureCount: 0,
    category: result.meta.category,
    statusCode: result.meta.statusCode,
    error: `TxLINE request failed with category ${result.meta.category}`,
  };
}

export async function getTxlineFixturesSnapshotResult(competitionId?: number) {
  const query = competitionId != null ? `?competitionId=${competitionId}` : "";
  return txlineArrayRequest<TxlineFixture>(`/fixtures/snapshot${query}`);
}

export async function getTxlineOddsSnapshotResult(fixtureId: number) {
  return txlineArrayRequest<TxlineOddsEntry>(`/odds/snapshot/${fixtureId}`);
}

export async function getTxlineOddsUpdatesResult(fixtureId: number, since?: number) {
  const query = since != null ? `?since=${since}` : "";
  return txlineArrayRequest<TxlineOddsEntry>(`/odds/updates/${fixtureId}${query}`);
}

export async function getTxlineScoresSnapshotResult(fixtureId: number) {
  return txlineArrayRequest<TxlineScoreEntry>(`/scores/snapshot/${fixtureId}`);
}

export async function getTxlineScoresUpdatesResult(fixtureId: number, since?: number) {
  const query = since != null ? `?since=${since}` : "";
  return txlineArrayRequest<TxlineScoreEntry>(`/scores/updates/${fixtureId}${query}`);
}

export async function getTxlineFixtures(competitionId?: number): Promise<TxlineFixture[]> {
  const result = await getTxlineFixturesSnapshotResult(competitionId);
  return unwrapTxlineArrayResult(result);
}

export async function getTxlineOdds(fixtureId: number): Promise<TxlineOddsEntry[]> {
  const result = await getTxlineOddsSnapshotResult(fixtureId);
  return unwrapTxlineArrayResult(result);
}

export async function getTxlineScores(fixtureId: number): Promise<TxlineScoreEntry[]> {
  const result = await getTxlineScoresSnapshotResult(fixtureId);
  return unwrapTxlineArrayResult(result);
}
