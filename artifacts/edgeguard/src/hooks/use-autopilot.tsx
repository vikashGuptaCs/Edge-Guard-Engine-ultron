import React, { createContext, useContext, useState } from 'react';

interface AutopilotState {
  enabled: boolean;
  threshold: number;
  hardLocked: boolean;
}

interface AutopilotContextType extends AutopilotState {
  setEnabled: (enabled: boolean) => void;
  setThreshold: (threshold: number) => void;
  setHardLocked: (locked: boolean) => void;
}

const AutopilotContext = createContext<AutopilotContextType | undefined>(undefined);

export function AutopilotProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [threshold, setThreshold] = useState(80);
  const [hardLocked, setHardLocked] = useState(false);

  return (
    <AutopilotContext.Provider
      value={{
        enabled,
        threshold,
        hardLocked,
        setEnabled,
        setThreshold,
        setHardLocked,
      }}
    >
      {children}
    </AutopilotContext.Provider>
  );
}

export function useAutopilot() {
  const context = useContext(AutopilotContext);
  if (context === undefined) {
    throw new Error('useAutopilot must be used within an AutopilotProvider');
  }
  return context;
}
