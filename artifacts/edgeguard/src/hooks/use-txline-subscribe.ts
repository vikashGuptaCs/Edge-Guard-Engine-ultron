import { useState, useCallback } from "react";
import { useWallet } from "@/hooks/use-wallet";
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { usePostTxlineActivate, useGetTxlineGuestJwt } from "@workspace/api-client-react";

const TXORACLE_PROGRAM_ID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
const TXL_MINT = new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG");
const SERVICE_LEVEL_ID = 1;
const DURATION_WEEKS = 4;

export type SubscribeStep = "idle" | "getting-jwt" | "subscribing" | "signing" | "activating" | "done" | "error";

export function useTxlineSubscribe() {
  const { connected, publicKey, hasExecutionWallet, isReadOnly, signMessage, sendTransaction, getConnection } = useWallet();
  const [step, setStep] = useState<SubscribeStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);

  const activateMutation = usePostTxlineActivate();

  const subscribe = useCallback(async () => {
    if (!connected || !publicKey) {
      setError("Wallet not connected");
      return;
    }

    if (!hasExecutionWallet || isReadOnly) {
      setError("Switch to Manual or an approved execution mode with Phantom before sending on-chain transactions.");
      return;
    }

    setError(null);
    setNewToken(null);

    try {
      setStep("getting-jwt");
      const jwtRes = await fetch("/api/txline/guest-jwt");
      if (!jwtRes.ok) throw new Error("Failed to get guest JWT");
      const { jwt } = await jwtRes.json() as { jwt: string };

      setStep("subscribing");
      const connection = getConnection();
      const walletPubkey = new PublicKey(publicKey);

      // Compute the subscription PDA
      const [subscriptionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("subscription"), walletPubkey.toBuffer()],
        TXORACLE_PROGRAM_ID
      );

      // Build the subscribe discriminator: sha256("global:subscribe")[0:8]
      // Pre-computed: [206, 100, 112, 205, 254, 49, 214, 120]
      const discriminator = Buffer.from([206, 100, 112, 205, 254, 49, 214, 120]);

      // Encode args: service_level (u8) + duration_weeks (u8)
      const argsBuffer = Buffer.alloc(2);
      argsBuffer.writeUInt8(SERVICE_LEVEL_ID, 0);
      argsBuffer.writeUInt8(DURATION_WEEKS, 1);

      const data = Buffer.concat([discriminator, argsBuffer]);

      const instruction = new TransactionInstruction({
        programId: TXORACLE_PROGRAM_ID,
        keys: [
          { pubkey: walletPubkey, isSigner: true, isWritable: true },
          { pubkey: subscriptionPda, isSigner: false, isWritable: true },
          { pubkey: TXL_MINT, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
      });

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const transaction = new Transaction({
        feePayer: walletPubkey,
        blockhash,
        lastValidBlockHeight,
      }).add(instruction);

      const txSig = await sendTransaction(transaction);
      await connection.confirmTransaction({ signature: txSig, blockhash, lastValidBlockHeight }, "confirmed");

      setStep("signing");
      const msgBytes = new TextEncoder().encode(`${txSig}::${jwt}`);
      const sigBytes = await signMessage(msgBytes);
      const walletSignature = Buffer.from(sigBytes).toString("base64");

      setStep("activating");
      const result = await activateMutation.mutateAsync({
        data: { txSig, walletSignature, jwt, leagues: [] },
      });

      setNewToken(result.apiToken);
      setStep("done");
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      setError(msg);
      setStep("error");
    }
  }, [connected, publicKey, hasExecutionWallet, isReadOnly, signMessage, sendTransaction, getConnection, activateMutation]);

  const reset = useCallback(() => {
    setStep("idle");
    setError(null);
    setNewToken(null);
  }, []);

  return { subscribe, reset, step, error, newToken };
}
