import React, { createContext, useContext, useEffect, useState } from 'react';
import { useListFixtures } from '@workspace/api-client-react';
import { useRiskAgents, WorkerStatus, FixtureRiskState, WorkerSignal } from '@/hooks/use-risk-agents';

interface RiskAgentContextType {
  workerStatus: WorkerStatus;
  monitoredFixtureCount: number;
  getFixtureRisk: (fixtureId: number) => FixtureRiskState | undefined;
  allFixtureRisks: Map<number, FixtureRiskState>;
  getAgentSignal: (fixtureId: number, agentName: WorkerSignal['agentName']) => WorkerSignal | undefined;
}

const RiskAgentContext = createContext<RiskAgentContextType>({
  workerStatus: 'idle',
  monitoredFixtureCount: 0,
  getFixtureRisk: () => undefined,
  allFixtureRisks: new Map(),
  getAgentSignal: () => undefined,
});

export function RiskAgentProvider({ children }: { children: React.ReactNode }) {
  const [monitoredCount, setMonitoredCount] = useState(0);

  const { data: fixtures = [] } = useListFixtures(
    { status: 'live' },
    { query: { refetchInterval: 30_000 } },
  );

  const { status, fixtureRisks, getFixtureRisk, updateFixtures } = useRiskAgents(2500);

  useEffect(() => {
    const ids = fixtures.map((f) => f.fixtureId);
    if (ids.length > 0) {
      setMonitoredCount(ids.length);
      updateFixtures(ids);
    }
  }, [fixtures, updateFixtures]);

  const getAgentSignal = (
    fixtureId: number,
    agentName: WorkerSignal['agentName'],
  ) => fixtureRisks.get(fixtureId)?.signals.find((s) => s.agentName === agentName);

  return (
    <RiskAgentContext.Provider
      value={{
        workerStatus: status,
        monitoredFixtureCount: monitoredCount,
        getFixtureRisk,
        allFixtureRisks: fixtureRisks,
        getAgentSignal,
      }}
    >
      {children}
    </RiskAgentContext.Provider>
  );
}

export function useRiskAgentContext() {
  return useContext(RiskAgentContext);
}
