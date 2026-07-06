import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, useRef } from 'react';
import {
  ConnectionProvider,
  WalletProvider as AdapterWalletProvider,
  useConnection,
  useWallet as useAdapterWallet,
} from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

type WalletSource = 'phantom' | 'manual' | null;
type Network = 'devnet' | 'mainnet';
type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnecting' | 'error' | 'reconnecting';

interface WalletContextType {
  connected: boolean;
  connecting: boolean;
  connectionState: ConnectionState;
  publicKey: string | null;
  source: WalletSource;
  network: Network;
  error: string | null;
  isRetrying: boolean;
  connect: (source: WalletSource, key?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  reconnect: () => Promise<void>;
  setNetwork: (network: Network) => void;
  clearError: () => void;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  sendTransaction: (tx: Transaction | VersionedTransaction) => Promise<string>;
  getConnection: () => Connection;
}

const DEVNET_RPC = 'https://api.devnet.solana.com';
const MAINNET_RPC = 'https://api.mainnet-beta.solana.com';
const NETWORK_STORAGE_KEY = 'edgeguard.wallet.network';
const LAST_WALLET_SOURCE_KEY = 'edgeguard.wallet.source';
const LAST_PUBLIC_KEY_KEY = 'edgeguard.wallet.publickey';
const RETRY_INTERVAL = 5000;
const MAX_RETRY_ATTEMPTS = 3;

const WalletContext = createContext<WalletContextType | undefined>(undefined);

function getInitialNetwork(): Network {
  if (typeof window === 'undefined') return 'devnet';
  const stored = window.localStorage.getItem(NETWORK_STORAGE_KEY);
  return stored === 'mainnet' ? 'mainnet' : 'devnet';
}

function getStoredWalletSource(): WalletSource {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem(LAST_WALLET_SOURCE_KEY);
  return (stored as WalletSource) || null;
}

function getStoredPublicKey(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(LAST_PUBLIC_KEY_KEY) || null;
}

function formatWalletError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes('user rejected') || lower.includes('cancelled') || lower.includes('rejected')) {
    return 'Connection was cancelled in your wallet. Please try again.';
  }

  if (lower.includes('not installed') || lower.includes('not found') || lower.includes('provider')) {
    return 'Phantom is not available. Install the browser extension at phantom.app';
  }

  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'Connection timed out. Check your network and try again.';
  }

  if (lower.includes('already connecting')) {
    return 'Connection in progress. Please wait.';
  }

  return message || 'Unable to connect your wallet. Please try again.';
}

function InnerWalletProvider({
  children,
  network,
  setNetwork,
}: {
  children: React.ReactNode;
  network: Network;
  setNetwork: (network: Network) => void;
}) {
  const adapter = useAdapterWallet();
  const { connection: devnetConnection } = useConnection();
  const [source, setSource] = useState<WalletSource>(null);
  const [manualPublicKey, setManualPublicKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [isRetrying, setIsRetrying] = useState(false);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastConnectionSourceRef = useRef<WalletSource>(null);

  // Persist network preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(NETWORK_STORAGE_KEY, network);
    }
  }, [network]);

  // Persist wallet source and public key
  useEffect(() => {
    if (typeof window !== 'undefined' && source) {
      window.localStorage.setItem(LAST_WALLET_SOURCE_KEY, source);
      if (source === 'manual' && manualPublicKey) {
        window.localStorage.setItem(LAST_PUBLIC_KEY_KEY, manualPublicKey);
      }
    }
  }, [source, manualPublicKey]);

  // Track adapter connection state
  useEffect(() => {
    if (adapter.connected && adapter.publicKey) {
      const walletName = adapter.wallet?.adapter.name?.toLowerCase() ?? '';
      setSource(walletName.includes('phantom') ? 'phantom' : 'manual');
      setManualPublicKey(null);
      setError(null);
      setConnectionState('connected');
      retryCountRef.current = 0;
      return;
    }

    if (adapter.connecting) {
      setConnectionState('connecting');
      return;
    }

    if (!manualPublicKey) {
      setSource(null);
      setConnectionState('idle');
    }
  }, [adapter.connected, adapter.connecting, adapter.publicKey, adapter.wallet, manualPublicKey]);

  // Clear retry timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  const connect = useCallback(
    async (nextSource: WalletSource, key?: string) => {
      // Clear any pending retries
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }

      setError(null);
      retryCountRef.current = 0;
      setIsRetrying(false);
      lastConnectionSourceRef.current = nextSource;

      if (nextSource === 'manual') {
        const normalizedKey = key?.trim();
        if (!normalizedKey) {
          throw new Error('Enter a valid Solana public key to continue in viewer mode.');
        }

        try {
          setConnectionState('connecting');
          const parsed = new PublicKey(normalizedKey);
          setManualPublicKey(parsed.toBase58());
          setSource('manual');
          setConnectionState('connected');
          return;
        } catch {
          setConnectionState('error');
          throw new Error('That public key is invalid. Please enter a valid Base58 Solana address.');
        }
      }

      if (nextSource === 'phantom') {
        setConnectionState('connecting');

        try {
          if (!adapter.wallet) {
            try {
              adapter.select('Phantom' as never);
            } catch {
              // Ignore selection issues
            }
          }

          if (adapter.connected && adapter.publicKey) {
            setSource('phantom');
            setConnectionState('connected');
            return;
          }

          await adapter.connect();
          setSource('phantom');
          setConnectionState('connected');
          return;
        } catch (err) {
          setConnectionState('error');
          setSource(null);
          const errorMsg = formatWalletError(err);
          setError(errorMsg);
          throw new Error(errorMsg);
        }
      }

      throw new Error('Invalid wallet connect request.');
    },
    [adapter]
  );

  const reconnect = useCallback(async () => {
    if (connectionState === 'reconnecting' || isRetrying) {
      return;
    }

    const sourceToReconnect = lastConnectionSourceRef.current || getStoredWalletSource();
    if (!sourceToReconnect) return;

    if (retryCountRef.current >= MAX_RETRY_ATTEMPTS) {
      setError('Failed to reconnect after multiple attempts. Please reconnect manually.');
      setConnectionState('error');
      return;
    }

    setIsRetrying(true);
    setConnectionState('reconnecting');
    retryCountRef.current += 1;

    try {
      await connect(sourceToReconnect, sourceToReconnect === 'manual' ? getStoredPublicKey() || undefined : undefined);
      setIsRetrying(false);
    } catch (err) {
      setIsRetrying(false);
      const delayMs = Math.min(1000 * Math.pow(2, retryCountRef.current - 1), 10000);

      retryTimeoutRef.current = setTimeout(() => {
        void reconnect();
      }, delayMs);
    }
  }, [connect, connectionState, isRetrying]);

  const disconnect = useCallback(async () => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    setError(null);
    setManualPublicKey(null);
    setSource(null);
    setConnectionState('disconnecting');
    setIsRetrying(false);
    retryCountRef.current = 0;
    lastConnectionSourceRef.current = null;

    try {
      if (adapter.connected) {
        await adapter.disconnect();
      }
    } catch (err) {
      console.warn('Wallet disconnect warning:', err);
    } finally {
      setConnectionState('idle');
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(LAST_WALLET_SOURCE_KEY);
        window.localStorage.removeItem(LAST_PUBLIC_KEY_KEY);
      }
    }
  }, [adapter]);

  const signMessage = useCallback(
    async (message: Uint8Array) => {
      if (!adapter.connected || !adapter.signMessage) {
        throw new Error('Wallet is not connected. Please connect Phantom first.');
      }

      try {
        return await adapter.signMessage(message);
      } catch (err) {
        const errorMsg = formatWalletError(err);
        setError(errorMsg);
        throw new Error(errorMsg);
      }
    },
    [adapter]
  );

  const sendTransaction = useCallback(
    async (tx: Transaction | VersionedTransaction) => {
      if (!adapter.publicKey) {
        throw new Error('Wallet is not connected. Please connect Phantom first.');
      }

      try {
        const connection = network === 'devnet' ? devnetConnection : new Connection(MAINNET_RPC, 'confirmed');
        return await adapter.sendTransaction(tx, connection);
      } catch (err) {
        const errorMsg = formatWalletError(err);
        setError(errorMsg);
        throw new Error(errorMsg);
      }
    },
    [adapter, devnetConnection, network]
  );

  const getConnection = useCallback(() => {
    return network === 'devnet' ? devnetConnection : new Connection(MAINNET_RPC, 'confirmed');
  }, [devnetConnection, network]);

  const resolvedPublicKey = useMemo(() => {
    if (source === 'manual' && manualPublicKey) return manualPublicKey;
    return adapter.publicKey?.toBase58() ?? null;
  }, [adapter.publicKey, manualPublicKey, source]);

  const value = useMemo<WalletContextType>(
    () => ({
      connected: Boolean(resolvedPublicKey),
      connecting: adapter.connecting || connectionState === 'connecting',
      connectionState,
      publicKey: resolvedPublicKey,
      source,
      network,
      error,
      isRetrying,
      connect,
      disconnect,
      reconnect,
      setNetwork,
      clearError: () => setError(null),
      signMessage,
      sendTransaction,
      getConnection,
    }),
    [adapter.connecting, connect, connectionState, disconnect, error, getConnection, isRetrying, network, reconnect, resolvedPublicKey, sendTransaction, setNetwork, signMessage, source]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [network, setNetworkState] = useState<Network>(getInitialNetwork);
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={network === 'devnet' ? DEVNET_RPC : MAINNET_RPC}>
      <AdapterWalletProvider wallets={wallets} autoConnect onError={(err) => console.warn('Wallet adapter error:', err)}>
        <InnerWalletProvider network={network} setNetwork={(next) => setNetworkState(next)}>
          {children}
        </InnerWalletProvider>
      </AdapterWalletProvider>
    </ConnectionProvider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
