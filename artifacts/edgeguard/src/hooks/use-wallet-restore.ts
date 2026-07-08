import { useEffect, useRef } from 'react';
import { useWallet } from './use-wallet';

const LAST_WALLET_SOURCE_KEY = 'edgeguard.wallet.source';
const LAST_PUBLIC_KEY_KEY = 'edgeguard.wallet.publickey';

/**
 * Hook that automatically attempts to restore wallet connection on app load
 * Uses localStorage to track the last connected wallet
 * Will only attempt restore if user was previously connected
 */
export function useWalletRestore() {
  const { connected, connect, authState, startRestore, finishRestore, failRestore } = useWallet();
  const restoreAttemptedRef = useRef(false);

  useEffect(() => {
    // Only attempt restore once per app load
    if (restoreAttemptedRef.current || connected) {
      return;
    }

    restoreAttemptedRef.current = true;

    const attemptRestore = async () => {
      startRestore();

      try {
        if (typeof window === 'undefined') return;

        const storedSource = window.localStorage.getItem(LAST_WALLET_SOURCE_KEY);
        if (!storedSource || !['phantom', 'manual'].includes(storedSource)) {
          finishRestore(false);
          return;
        }

        if (storedSource === 'manual') {
          const storedKey = window.localStorage.getItem(LAST_PUBLIC_KEY_KEY);
          if (storedKey) {
            await connect('manual', storedKey);
            finishRestore(true);
            return;
          }
          finishRestore(false);
          return;
        }

        if (storedSource === 'phantom') {
          // Only auto-restore phantom if it was previously connected
          await connect('phantom');
          finishRestore(true);
          return;
        }
      } catch (err) {
        // Silently fail - user can reconnect manually
        console.debug('Wallet restore attempt failed:', err);
        failRestore();
      }
    };

    // Small delay to allow providers to initialize
    const timer = setTimeout(attemptRestore, 100);
    return () => clearTimeout(timer);
  }, [connected, connect, failRestore, finishRestore, startRestore]);

  return {
    isAttemptingRestore: authState === 'restoring',
    restoreAttempted: restoreAttemptedRef.current,
  };
}
