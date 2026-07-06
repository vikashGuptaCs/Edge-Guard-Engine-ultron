import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from "react";
import { ConnectionProvider, WalletProvider as AdapterWalletProvider, useWallet as useAdapterWallet, useConnection } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { Connection, Transaction, VersionedTransaction } from "@solana/web3.js";

const DEVNET_RPC = "https://api.devnet.solana.com";
const MAINNET_RPC = "https://api.mainnet-beta.solana.com";

type WalletSource = "phantom" | "manual" | null;
type Network = "devnet" | "mainnet";

interface WalletContextType {
  connected: boolean;
  connecting: boolean;
  publicKey: string | null;
  source: WalletSource;
  network: Network;
  connect: (source: WalletSource, key?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  setNetwork: (n: Network) => void;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  sendTransaction: (tx: Transaction | VersionedTransaction) => Promise<string>;
  getConnection: () => Connection;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

function InnerWalletProvider({ children }: { children: React.ReactNode }) {
  const adapter = useAdapterWallet();
  const { connection: devnetConn } = useConnection();
  const [network, setNetworkState] = useState<Network>("devnet");
  const [source, setSource] = useState<WalletSource>(null);

  useEffect(() => {
    if (adapter.connected && adapter.wallet) {
      const name = adapter.wallet.adapter.name.toLowerCase();
      if (name.includes("phantom")) setSource("phantom");
      else setSource("manual");
    } else {
      setSource(null);
    }
  }, [adapter.connected, adapter.wallet]);

  const connect = useCallback(async (src: WalletSource, _key?: string) => {
    if (src === "phantom") {
      if (!adapter.wallet) {
        adapter.select("Phantom" as any);
      }
      try {
        await adapter.connect();
      } catch (err) {
        console.warn("Phantom connect error:", err);
        throw err;
      }
    }
  }, [adapter]);

  const disconnect = useCallback(async () => {
    await adapter.disconnect();
    setSource(null);
  }, [adapter]);

  const setNetwork = useCallback((n: Network) => {
    setNetworkState(n);
  }, []);

  const signMessage = useCallback(async (message: Uint8Array): Promise<Uint8Array> => {
    if (!adapter.signMessage) throw new Error("Wallet does not support signMessage");
    return adapter.signMessage(message);
  }, [adapter]);

  const sendTransaction = useCallback(async (tx: Transaction | VersionedTransaction): Promise<string> => {
    const conn = network === "devnet" ? devnetConn : new Connection(MAINNET_RPC, "confirmed");
    return adapter.sendTransaction(tx, conn);
  }, [adapter, network, devnetConn]);

  const getConnection = useCallback((): Connection => {
    return network === "devnet" ? devnetConn : new Connection(MAINNET_RPC, "confirmed");
  }, [network, devnetConn]);

  const value: WalletContextType = {
    connected: adapter.connected,
    connecting: adapter.connecting,
    publicKey: adapter.publicKey?.toBase58() ?? null,
    source,
    network,
    connect,
    disconnect,
    setNetwork,
    signMessage,
    sendTransaction,
    getConnection,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function SolanaProvider({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={DEVNET_RPC}>
      <AdapterWalletProvider wallets={wallets} autoConnect onError={(err) => console.warn("Wallet adapter error:", err)}>
        <InnerWalletProvider>{children}</InnerWalletProvider>
      </AdapterWalletProvider>
    </ConnectionProvider>
  );
}

export function useWallet(): WalletContextType {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within SolanaProvider");
  return ctx;
}
