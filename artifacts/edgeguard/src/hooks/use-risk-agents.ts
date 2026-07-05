import { useState, useEffect, useCallback, useRef } from 'react';

export interface WorkerSignal {
  agentName: 'Sentinel' | 'Overreaction' | 'Volatility' | 'Pattern' | 'Orchestrator';
  signalType: string;
  confidence: number;
  payload?: Record<string, unknown>;
}

export interface FixtureRiskState {
  fixtureId: number;
  ts: number;
  signals: WorkerSignal[];
  edgeScore: number;
  recommendation: string;
  latencyMs: number;
}

export type WorkerStatus = 'idle' | 'starting' | 'running' | 'error';

export interface UseRiskAgentsResult {
  status: WorkerStatus;
  fixtureRisks: Map<number, FixtureRiskState>;
  getFixtureRisk: (fixtureId: number) => FixtureRiskState | undefined;
  updateFixtures: (fixtureIds: number[]) => void;
}

export function useRiskAgents(pollIntervalMs = 2500): UseRiskAgentsResult {
  const workerRef = useRef<Worker | null>(null);
  const readyRef  = useRef(false);
  const pendingFixturesRef = useRef<number[]>([]);

  const [status, setStatus] = useState<WorkerStatus>('idle');
  const [fixtureRisks, setFixtureRisks] = useState<Map<number, FixtureRiskState>>(new Map());

  /** Send UPDATE_FIXTURES — or queue it until the worker is ready. */
  const updateFixtures = useCallback((ids: number[]) => {
    if (readyRef.current && workerRef.current) {
      workerRef.current.postMessage({ type: 'UPDATE_FIXTURES', fixtureIds: ids });
    } else {
      pendingFixturesRef.current = ids;
    }
  }, []);

  useEffect(() => {
    setStatus('starting');

    const worker = new Worker(
      new URL('../workers/risk-agents.worker.ts', import.meta.url),
      { type: 'module' },
    );
    workerRef.current = worker;

    worker.addEventListener('message', (e: MessageEvent) => {
      const msg = e.data as
        | { type: 'READY' }
        | { type: 'ERROR'; message: string; fixtureId: number }
        | {
            type: 'SIGNALS';
            fixtureId: number;
            ts: number;
            signals: WorkerSignal[];
            edgeScore: number;
            recommendation: string;
            latencyMs: number;
          };

      if (msg.type === 'READY') {
        readyRef.current = true;
        setStatus('running');
        // Flush any fixture IDs that arrived before the worker was ready
        if (pendingFixturesRef.current.length > 0) {
          worker.postMessage({ type: 'UPDATE_FIXTURES', fixtureIds: pendingFixturesRef.current });
          pendingFixturesRef.current = [];
        }
      } else if (msg.type === 'SIGNALS') {
        setFixtureRisks((prev) => {
          const next = new Map(prev);
          next.set(msg.fixtureId, {
            fixtureId:      msg.fixtureId,
            ts:             msg.ts,
            signals:        msg.signals,
            edgeScore:      msg.edgeScore,
            recommendation: msg.recommendation,
            latencyMs:      msg.latencyMs,
          });
          return next;
        });
      } else if (msg.type === 'ERROR') {
        console.warn('[RiskWorker] error for fixture', msg.fixtureId, msg.message);
      }
    });

    worker.addEventListener('error', (err) => {
      console.error('[RiskWorker] fatal error', err);
      setStatus('error');
    });

    const basePath = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
    // Start the worker with an empty fixture list; fixtures pushed via UPDATE_FIXTURES
    worker.postMessage({
      type: 'START',
      fixtureIds: [],
      basePath,
      pollIntervalMs,
    });

    return () => {
      readyRef.current = false;
      worker.postMessage({ type: 'STOP' });
      setTimeout(() => worker.terminate(), 200);
      workerRef.current = null;
      setStatus('idle');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount/unmount only

  const getFixtureRisk = useCallback(
    (id: number) => fixtureRisks.get(id),
    [fixtureRisks],
  );

  return { status, fixtureRisks, getFixtureRisk, updateFixtures };
}
