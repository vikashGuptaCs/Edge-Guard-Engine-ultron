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
  connect: (source: WalletSource, key?: string) => Promise<void>;
  disconnect: () => void;
  setNetwork: (network: Network) => void;
}

interface SolanaPublicKey {
  toBase58: () => string;
  toString: () => string;
}

interface SolanaProvider {
  isPhantom?: boolean;
  isConnected?: boolean;
  publicKey?: SolanaPublicKey;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: SolanaPublicKey }>;
  disconnect: () => Promise<void>;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
}

declare global {
  interface Window {
    solana?: SolanaProvider;
  }
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WalletState>({
    connected: false,
    publicKey: null,
    source: null,
    network: 'devnet',
  });

  useEffect(() => {
    const provider = typeof window !== 'undefined' ? window.solana : undefined;
    if (!provider) {
      return;
    }

    const refreshState = () => {
      const publicKey = provider.publicKey?.toBase58?.() ?? provider.publicKey?.toString?.() ?? null;
      setState((s) => ({
        ...s,
        connected: Boolean(provider.isConnected && publicKey),
        publicKey,
        source: provider.isConnected && publicKey ? 'phantom' : s.source,
      }));
    };

    refreshState();

    const handleConnect = () => refreshState();
    const handleDisconnect = () => setState((s) => ({ ...s, connected: false, publicKey: null, source: null }));

    provider.on?.('connect', handleConnect);
    provider.on?.('disconnect', handleDisconnect);

    return () => {
      provider.removeListener?.('connect', handleConnect);
      provider.removeListener?.('disconnect', handleDisconnect);
    };
  }, []);

  const connect = async (source: WalletSource, key?: string) => {
    if (source === 'phantom') {
      const provider = typeof window !== 'undefined' ? window.solana : undefined;
      if (!provider?.connect) {
        throw new Error('No Solana wallet provider detected. Install Phantom or a compatible wallet extension.');
      }

      const result = await provider.connect();
      const publicKey = result.publicKey?.toBase58?.() ?? result.publicKey?.toString?.();

      if (!publicKey) {
        throw new Error('Failed to read public key from the wallet provider.');
      }

      setState((s) => ({ ...s, connected: true, publicKey, source }));
      return;
    }

    if (source === 'manual' && key) {
      setState((s) => ({ ...s, connected: true, publicKey: key, source }));
      return;
    }

    throw new Error('Invalid wallet connect request.');
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
