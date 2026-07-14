/**
 * EdgeGuard Risk Agents — Web Worker
 * Runs all 5 agent algorithms off the main thread.
 * Polls the API for odds snapshots, computes signals, posts results back.
 */

interface OddsSnapshot {
  id: number;
  fixtureId: number;
  ts: number;
  market: string;
  selection: string;
  stablePrice: number;
  spread: number;
  volume: number;
}

export interface WorkerSignal {
  agentName: 'Sentinel' | 'Overreaction' | 'Volatility' | 'Pattern' | 'Orchestrator';
  signalType: string;
  confidence: number;
  payload?: Record<string, unknown>;
}

// Rolling per-fixture history of odds snapshots
const oddsHistory = new Map<number, OddsSnapshot[]>();
const HISTORY_WINDOW = 14;

/** Group snapshots by market+selection and return only the most-populated
 * group. Prevents comparing prices from unrelated markets (e.g. 1X2 vs
 * Over/Under) as if they were one continuous series. */
function pickPrimaryMarketHistory(history: OddsSnapshot[]): OddsSnapshot[] {
  const groups = new Map<string, OddsSnapshot[]>();
  for (const snap of history) {
    const key = `${snap.market}:${snap.selection}`;
    const arr = groups.get(key) ?? [];
    arr.push(snap);
    groups.set(key, arr);
  }
  let best: OddsSnapshot[] = [];
  for (const arr of groups.values()) {
    if (arr.length > best.length) best = arr;
  }
  return best;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
let activeFixtureIds: number[] = [];
let apiBasePath = '';

self.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as
    | { type: 'START'; fixtureIds: number[]; basePath: string; pollIntervalMs: number }
    | { type: 'STOP' }
    | { type: 'UPDATE_FIXTURES'; fixtureIds: number[] };

  if (msg.type === 'START') {
    activeFixtureIds = msg.fixtureIds;
    apiBasePath = msg.basePath ?? '';
    startPolling(msg.pollIntervalMs ?? 2500);
    self.postMessage({ type: 'READY' });
  } else if (msg.type === 'STOP') {
    stopPolling();
  } else if (msg.type === 'UPDATE_FIXTURES') {
    activeFixtureIds = msg.fixtureIds;
    // Clear stale histories for removed fixtures
    for (const id of oddsHistory.keys()) {
      if (!activeFixtureIds.includes(id)) oddsHistory.delete(id);
    }
  }
});

function startPolling(interval: number) {
  if (pollTimer) clearInterval(pollTimer);
  void runCycle();
  pollTimer = setInterval(() => void runCycle(), interval);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function runCycle() {
  for (const fixtureId of activeFixtureIds) {
    try {
      const snapshots = await fetchOdds(fixtureId);
      if (snapshots.length === 0) continue;

      // Merge new snapshots into rolling history
      const history = oddsHistory.get(fixtureId) ?? [];
      for (const snap of snapshots) {
        if (!history.find((h) => h.id === snap.id)) history.push(snap);
      }
      history.sort((a, b) => a.ts - b.ts);
      if (history.length > HISTORY_WINDOW) history.splice(0, history.length - HISTORY_WINDOW);
      oddsHistory.set(fixtureId, history);

      const primaryHistory = pickPrimaryMarketHistory(history);
      if (primaryHistory.length === 0) continue;
      const latest = primaryHistory[primaryHistory.length - 1];
      const result = computeRiskSignals(fixtureId, primaryHistory, latest);
      
      // Post signals to UI thread for live display
      self.postMessage({ type: 'SIGNALS', ...result });
      
      // Persist signals to backend database
      void persistSignals(result.fixtureId, result.ts, result.signals);
    } catch (err) {
      self.postMessage({ type: 'ERROR', message: String(err), fixtureId });
    }
  }
}

async function fetchOdds(fixtureId: number): Promise<OddsSnapshot[]> {
  const url = `${apiBasePath}/api/fixtures/${fixtureId}/odds`;
  const res = await fetch(url);
  if (!res.ok) return [];
  return res.json() as Promise<OddsSnapshot[]>;
}

async function persistSignals(fixtureId: number, ts: number, signals: WorkerSignal[]): Promise<void> {
  try {
    const payload = signals.map(sig => ({
      fixtureId,
      ts,
      agentName: sig.agentName,
      signalType: sig.signalType,
      confidence: sig.confidence,
      payload: sig.payload,
    }));
    
    const url = `${apiBasePath}/api/agents/signals`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn('[RiskWorker] failed to persist signals:', err);
    // Don't throw - log and continue; UI display should not be blocked
  }
}

// ── Agent Algorithms ──────────────────────────────────────────────────────────

function computeRiskSignals(
  fixtureId: number,
  history: OddsSnapshot[],
  latest: OddsSnapshot,
) {
  const sentinel     = runSentinel(history, latest);
  const overreaction = runOverreaction(history);
  const volatility   = runVolatility(history);
  const pattern      = runPattern(history);
  const orchestrator = runOrchestrator(sentinel, overreaction, volatility, pattern);

  return {
    fixtureId,
    ts: Date.now(),
    signals: [sentinel, overreaction, volatility, pattern, orchestrator] as WorkerSignal[],
    edgeScore:      (orchestrator.payload?.edgeScore      as number) ?? 50,
    recommendation: (orchestrator.payload?.recommendation as string) ?? 'HOLD',
    latencyMs: Date.now() - latest.ts,
  };
}

/** Sentinel — latency arbitrage + toxic-flow detector
 *
 * Latency is estimated from inter-snapshot gap rather than (now - ts) so the
 * agent works correctly even when the DB has been seeded with fixed timestamps.
 */
function runSentinel(history: OddsSnapshot[], latest: OddsSnapshot): WorkerSignal {
  // Use the gap between the two most-recent snapshots as a feed-latency proxy.
  // Falls back to a benign 50 ms if there is only one snapshot.
  const prev = history.length >= 2 ? history[history.length - 2] : null;
  const interSnapGap = prev ? Math.abs(latest.ts - prev.ts) : 50;
  // A gap > 60 s between consecutive snapshots signals stale feed / latency spike
  const latencyMs = Math.min(interSnapGap, 60_000);
  const spread    = latest.spread;

  if (latencyMs > 30_000 || spread > 0.30) {
    return { agentName: 'Sentinel', signalType: 'CIRCUIT_BREAKER', confidence: 1.0,
             payload: { latencyMs, spread } };
  }
  if (latencyMs > 10_000 || spread > 0.15) {
    return { agentName: 'Sentinel', signalType: 'TOXIC_FLOW', confidence: 0.88,
             payload: { latencyMs, spread } };
  }
  if (history.length >= 3) {
    const tail = history.slice(-3).map((h) => h.spread);
    const spreadDelta = tail[2] - tail[0];
    if (spreadDelta > 0.05) {
      return { agentName: 'Sentinel', signalType: 'TOXIC_FLOW', confidence: 0.72,
               payload: { latencyMs, spread, spreadDelta } };
    }
  }
  return { agentName: 'Sentinel', signalType: 'CLEAR', confidence: 0.96,
           payload: { latencyMs, spread } };
}

/** Overreaction — price-velocity mispricing after events */
function runOverreaction(history: OddsSnapshot[]): WorkerSignal {
  if (history.length < 4) {
    return { agentName: 'Overreaction', signalType: 'INSUFFICIENT_DATA', confidence: 0.50 };
  }

  const prices = history.map((h) => h.stablePrice);
  const recent = prices.slice(-4);
  const velocity = Math.abs(recent[3] - recent[0]);

  const older = prices.slice(0, Math.max(1, prices.length - 4));
  const baseline =
    older.length > 1
      ? Math.abs(older[older.length - 1] - older[0]) / (older.length - 1)
      : 0.01;

  const velocityRatio = velocity / (baseline * 4 + 0.001);

  if (velocityRatio > 5) {
    return {
      agentName: 'Overreaction', signalType: 'OVERREACTION_BUY',
      confidence: Math.min(0.96, 0.60 + velocityRatio * 0.04),
      payload: { velocity: +velocity.toFixed(4), velocityRatio: +velocityRatio.toFixed(2) },
    };
  }
  if (velocityRatio > 2.5) {
    return {
      agentName: 'Overreaction', signalType: 'DRIFT_DETECTED', confidence: 0.65,
      payload: { velocityRatio: +velocityRatio.toFixed(2) },
    };
  }
  return {
    agentName: 'Overreaction', signalType: 'FAIR_VALUE', confidence: 0.80,
    payload: { velocityRatio: +velocityRatio.toFixed(2) },
  };
}

/** Volatility — rolling σ of spreads */
function runVolatility(history: OddsSnapshot[]): WorkerSignal {
  const spreads = history.map((h) => h.spread);
  if (spreads.length < 4) {
    return { agentName: 'Volatility', signalType: 'INSUFFICIENT_DATA', confidence: 0.50 };
  }

  const mean     = spreads.reduce((a, b) => a + b, 0) / spreads.length;
  const variance = spreads.reduce((acc, v) => acc + (v - mean) ** 2, 0) / spreads.length;
  const stdDev   = Math.sqrt(variance);

  if (stdDev > 0.04) {
    return {
      agentName: 'Volatility', signalType: 'HIGH_VOLATILITY',
      confidence: Math.min(0.95, 0.70 + stdDev * 4),
      payload: { stdDev: +stdDev.toFixed(4), mean: +mean.toFixed(3) },
    };
  }
  if (stdDev > 0.02) {
    return {
      agentName: 'Volatility', signalType: 'ELEVATED_VOL', confidence: 0.72,
      payload: { stdDev: +stdDev.toFixed(4) },
    };
  }
  return {
    agentName: 'Volatility', signalType: 'LOW_VOLATILITY', confidence: 0.86,
    payload: { stdDev: +stdDev.toFixed(4) },
  };
}

/** Pattern — spoof spike + layering detection */
function runPattern(history: OddsSnapshot[]): WorkerSignal {
  if (history.length < 5) {
    return { agentName: 'Pattern', signalType: 'INSUFFICIENT_DATA', confidence: 0.50 };
  }

  const spreads = history.map((h) => h.spread);
  const mean     = spreads.reduce((a, b) => a + b, 0) / spreads.length;
  const variance = spreads.reduce((acc, v) => acc + (v - mean) ** 2, 0) / spreads.length;
  const stdDev   = Math.sqrt(variance);

  // Spoof: single spike > mean + 2σ followed by rapid reversion
  for (let i = 1; i < spreads.length - 1; i++) {
    if (spreads[i] > mean + 2 * stdDev && spreads[i + 1] < mean + stdDev) {
      const z = (spreads[i] - mean) / (stdDev + 0.0001);
      return {
        agentName: 'Pattern', signalType: 'SPOOF_DETECTED',
        confidence: Math.min(0.92, 0.60 + z * 0.08),
        payload: { mean: +mean.toFixed(3), stdDev: +stdDev.toFixed(4), z: +z.toFixed(2) },
      };
    }
  }

  // Layering: sustained spread widening (≥ 60 % of deltas positive)
  const deltas = spreads.slice(1).map((s, i) => s - spreads[i]);
  const positiveCount = deltas.filter((d) => d > 0.002).length;
  if (positiveCount / deltas.length >= 0.60 && deltas.length >= 4) {
    return {
      agentName: 'Pattern', signalType: 'LAYERING_DETECTED', confidence: 0.68,
      payload: { positiveFraction: +(positiveCount / deltas.length).toFixed(2) },
    };
  }

  return { agentName: 'Pattern', signalType: 'PATTERN_CLEAR', confidence: 0.87 };
}

/** Orchestrator — weighted consensus → final EDGE_SCORE + recommendation */
function runOrchestrator(
  sentinel:     WorkerSignal,
  overreaction: WorkerSignal,
  volatility:   WorkerSignal,
  pattern:      WorkerSignal,
): WorkerSignal {
  // Hard veto from sentinel
  if (sentinel.signalType === 'CIRCUIT_BREAKER') {
    return {
      agentName: 'Orchestrator', signalType: 'CIRCUIT_BREAKER', confidence: 1.0,
      payload: { edgeScore: 0, recommendation: 'VETO_CIRCUIT_BREAKER', consensus: '0/4' },
    };
  }
  if (sentinel.signalType === 'TOXIC_FLOW') {
    return {
      agentName: 'Orchestrator', signalType: 'VETO', confidence: 0.90,
      payload: { edgeScore: 15, recommendation: 'VETO_LATENCY', consensus: '0/4' },
    };
  }

  // Weighted scoring
  let edgeScore = 60;
  let votes     = 0;

  // Overreaction signal
  if (overreaction.signalType === 'OVERREACTION_BUY') {
    edgeScore += 20 * overreaction.confidence; votes += 1;
  } else if (overreaction.signalType === 'DRIFT_DETECTED') {
    edgeScore += 8; votes += 0.5;
  } else if (overreaction.signalType === 'FAIR_VALUE') {
    edgeScore += 5;
  }

  // Volatility (low is bullish)
  if (volatility.signalType === 'LOW_VOLATILITY') {
    edgeScore += 12; votes += 1;
  } else if (volatility.signalType === 'ELEVATED_VOL') {
    edgeScore -= 5;
  } else if (volatility.signalType === 'HIGH_VOLATILITY') {
    edgeScore -= 22;
  }

  // Pattern
  if (pattern.signalType === 'PATTERN_CLEAR') {
    edgeScore += 10; votes += 1;
  } else if (pattern.signalType === 'SPOOF_DETECTED') {
    edgeScore -= 28;
  } else if (pattern.signalType === 'LAYERING_DETECTED') {
    edgeScore -= 12;
  }

  // Sentinel clear bonus
  if (sentinel.signalType === 'CLEAR') {
    edgeScore += 8; votes += 1;
  }

  edgeScore = Math.round(Math.max(0, Math.min(100, edgeScore)));

  let recommendation: string;
  if (pattern.signalType === 'SPOOF_DETECTED') {
    recommendation = 'VETO_SPOOF';
  } else if (volatility.signalType === 'HIGH_VOLATILITY') {
    recommendation = 'VETO_SLIPPAGE';
  } else if (votes >= 3 && edgeScore >= 75) {
    recommendation = 'EXECUTE';
  } else if (edgeScore >= 60) {
    recommendation = 'MONITORING';
  } else {
    recommendation = 'HOLD';
  }

  const signalType =
    recommendation.startsWith('VETO') ? 'VETO'
    : recommendation === 'EXECUTE'    ? 'EXECUTE'
    : 'MONITORING';

  return {
    agentName: 'Orchestrator', signalType, confidence: votes / 4,
    payload: { edgeScore, recommendation, consensus: `${Math.round(votes)}/4` },
  };
}
