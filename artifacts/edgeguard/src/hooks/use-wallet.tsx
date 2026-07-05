import React, { createContext, useContext, useState, useEffect } from 'react';

type WalletSource = 'phantom' | 'manual' | null;
type Network = 'devnet' | 'mainnet';

interface WalletState {
  connected: boolean;
  publicKey: string | null;
  source: WalletSource;
  network: Network;
}

interface WalletContextType extends WalletState {
  connect: (source: WalletSource, key?: string) => void;
  disconnect: () => void;
  setNetwork: (network: Network) => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WalletState>({
    connected: false,
    publicKey: null,
    source: null,
    network: 'devnet',
  });

  const connect = (source: WalletSource, key?: string) => {
    if (source === 'phantom') {
      setState((s) => ({ ...s, connected: true, publicKey: '8jH...9fX', source }));
    } else if (source === 'manual' && key) {
      setState((s) => ({ ...s, connected: true, publicKey: key, source }));
    }
  };

  const disconnect = () => {
    setState((s) => ({ ...s, connected: false, publicKey: null, source: null }));
  };

  const setNetwork = (network: Network) => {
    setState((s) => ({ ...s, network }));
  };

  return (
    <WalletContext.Provider value={{ ...state, connect, disconnect, setNetwork }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
