import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const HARD_LOCK_STORAGE_KEY = 'edgeguard.hardLocked';

function readPersistedHardLock(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(HARD_LOCK_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export type AutopilotExecutionState =
  | 'disabled'
  | 'monitoring_only'
  | 'proposal_pending_approval'
  | 'approved_for_submission'
  | 'submitted';

export interface AutopilotProposal {
  id: string;
  receiptId?: number | null;
  fixtureId: number;
  actionSummary: string;
  reason: string;
  confidence: number;
  riskContext: string;
  createdAt: string;
}

interface AutopilotContextType {
  autopilotEnabled: boolean;
  autopilotExecutionState: AutopilotExecutionState;
  pendingProposal: AutopilotProposal | null;
  threshold: number;
  hardLocked: boolean;
  setAutopilotEnabled: (enabled: boolean) => void;
  setAutopilotExecutionState: (state: AutopilotExecutionState) => void;
  setThreshold: (threshold: number) => void;
  setHardLocked: (locked: boolean) => void;
  requestAutopilotApproval: (proposal: AutopilotProposal) => void;
  approveAutopilotProposal: (id: string) => void;
  rejectAutopilotProposal: (id: string) => void;
  markProposalSubmitted: (id: string) => void;
  clearPendingProposal: () => void;
}

const AutopilotContext = createContext<AutopilotContextType | undefined>(undefined);

export function AutopilotProvider({ children }: { children: React.ReactNode }) {
  const [autopilotEnabled, setAutopilotEnabledState] = useState(false);
  const [autopilotExecutionState, setAutopilotExecutionStateState] = useState<AutopilotExecutionState>('disabled');
  const [pendingProposal, setPendingProposal] = useState<AutopilotProposal | null>(null);
  const [threshold, setThreshold] = useState(80);
  const [hardLocked, setHardLocked] = useState(readPersistedHardLock);

  useEffect(() => {
    try {
      if (hardLocked) {
        window.localStorage.setItem(HARD_LOCK_STORAGE_KEY, 'true');
      } else {
        window.localStorage.removeItem(HARD_LOCK_STORAGE_KEY);
      }
    } catch {
      // ignore localStorage failures
    }
  }, [hardLocked]);

  const setAutopilotEnabled = useCallback((enabled: boolean) => {
    setAutopilotEnabledState(enabled);
    setAutopilotExecutionStateState(enabled ? 'monitoring_only' : 'disabled');

    if (!enabled) {
      setPendingProposal(null);
    }
  }, []);

  const setAutopilotExecutionState = useCallback((state: AutopilotExecutionState) => {
    setAutopilotExecutionStateState(state);
    setAutopilotEnabledState(state !== 'disabled');

    if (state === 'disabled' || state === 'monitoring_only') {
      setPendingProposal((current) => (state === 'disabled' ? null : current));
    }
  }, []);

  const setHardLockedState = useCallback((locked: boolean) => {
    setHardLocked(locked);
    try {
      if (locked) {
        window.localStorage.setItem(HARD_LOCK_STORAGE_KEY, 'true');
      } else {
        window.localStorage.removeItem(HARD_LOCK_STORAGE_KEY);
      }
    } catch {}

    if (locked) {
      setAutopilotEnabledState(false);
      setAutopilotExecutionStateState('disabled');
    } else if (pendingProposal) {
      setAutopilotEnabledState(true);
      setAutopilotExecutionStateState('proposal_pending_approval');
    }
  }, [pendingProposal]);

  const requestAutopilotApproval = useCallback((proposal: AutopilotProposal) => {
    setPendingProposal(proposal);
    setAutopilotEnabledState(true);
    setAutopilotExecutionStateState('proposal_pending_approval');
  }, []);

  const approveAutopilotProposal = useCallback((id: string) => {
    setPendingProposal((current) => (current?.id === id ? current : current));
    setAutopilotEnabledState(true);
    setAutopilotExecutionStateState('approved_for_submission');
  }, []);

  const rejectAutopilotProposal = useCallback((id: string) => {
    setPendingProposal((current) => (current?.id === id ? null : current));
    setAutopilotEnabledState(true);
    setAutopilotExecutionStateState('monitoring_only');
  }, []);

  const markProposalSubmitted = useCallback((id: string) => {
    setPendingProposal((current) => (current?.id === id ? current : current));
    setAutopilotEnabledState(true);
    setAutopilotExecutionStateState('submitted');
  }, []);

  const clearPendingProposal = useCallback(() => {
    setPendingProposal(null);
  }, []);

  const value = useMemo(
    () => ({
      autopilotEnabled,
      autopilotExecutionState,
      pendingProposal,
      threshold,
      hardLocked,
      setAutopilotEnabled,
      setAutopilotExecutionState,
      setThreshold,
      setHardLocked: setHardLockedState,
      requestAutopilotApproval,
      approveAutopilotProposal,
      rejectAutopilotProposal,
      markProposalSubmitted,
      clearPendingProposal,
    }),
    [
      autopilotEnabled,
      autopilotExecutionState,
      clearPendingProposal,
      hardLocked,
      markProposalSubmitted,
      pendingProposal,
      rejectAutopilotProposal,
      requestAutopilotApproval,
      setAutopilotEnabled,
      setAutopilotExecutionState,
      setHardLockedState,
      threshold,
      approveAutopilotProposal,
    ]
  );

  return (
    <AutopilotContext.Provider value={value}>{children}</AutopilotContext.Provider>
  );
}

export function useAutopilot() {
  const context = useContext(AutopilotContext);
  if (context === undefined) {
    throw new Error('useAutopilot must be used within an AutopilotProvider');
  }
  return context;
}
