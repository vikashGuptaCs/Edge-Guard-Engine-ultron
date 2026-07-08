import React, { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAutopilot } from "@/hooks/use-autopilot";
import { useWallet, type WalletAccessMode } from "@/hooks/use-wallet";
import { useTxlineSubscribe } from "@/hooks/use-txline-subscribe";
import { useToast } from "@/hooks/use-toast";
import {
  Settings,
  ShieldAlert,
  Globe,
  Cpu,
  Link as LinkIcon,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Wifi,
  Wallet,
  Key,
  AlertTriangle,
  Copy,
  ExternalLink,
  ChevronRight,
  Bot,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  getGetTxlineFixturesQueryKey,
  getGetTxlineStatusQueryKey,
  getListReceiptsQueryKey,
  useCreateReceipt,
  useGetTxlineFixtures,
  useGetTxlineStatus,
  useUpdateReceiptLifecycle,
} from "@workspace/api-client-react";

const STEP_LABELS: Record<string, string> = {
  idle: "Subscribe",
  "getting-jwt": "Getting session JWT…",
  subscribing: "Sending on-chain tx…",
  signing: "Sign activation message…",
  activating: "Activating with TxODDS…",
  done: "Activated!",
  error: "Retry",
};

const MODE_OPTIONS: Array<{ value: WalletAccessMode; label: string; helper: string }> = [
  { value: "read_only", label: "Read Only", helper: "Observation stays available. No transaction submission is allowed." },
  { value: "wallet_connected_manual", label: "Manual", helper: "Recommendations require explicit Approve & Submit action." },
  { value: "wallet_connected_autopilot_pending_approval", label: "Autopilot Waiting Approval", helper: "Autopilot can propose, but it cannot submit yet." },
  { value: "wallet_connected_autopilot_active", label: "Autopilot Active", helper: "Only approved autopilot proposals may move to submission." },
];

const AUTH_STATE_LABELS: Record<string, string> = {
  unknown: "Waiting for wallet status",
  restoring: "Restoring prior wallet session",
  connected: "Wallet session available",
  disconnected: "No wallet session restored",
  error: "Wallet restore failed",
};

const AUTOPILOT_STATE_LABELS: Record<string, string> = {
  disabled: "Disabled",
  monitoring_only: "Monitoring Only",
  proposal_pending_approval: "Proposal Pending Approval",
  approved_for_submission: "Approved For Submission",
  submitted: "Submitted",
};

function assertManualExecutionAllowed(accessMode: WalletAccessMode) {
  if (accessMode !== "wallet_connected_manual") {
    throw new Error("Manual execution is not allowed in the current access mode.");
  }
}

function canSubmitAutopilotTransaction(args: {
  accessMode: WalletAccessMode;
  autopilotExecutionState: string;
}) {
  return (
    args.accessMode === "wallet_connected_autopilot_active" &&
    args.autopilotExecutionState === "approved_for_submission"
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const {
    autopilotEnabled,
    autopilotExecutionState,
    pendingProposal,
    threshold,
    hardLocked,
    setAutopilotEnabled,
    setAutopilotExecutionState,
    setThreshold,
    setHardLocked,
    requestAutopilotApproval,
    approveAutopilotProposal,
    rejectAutopilotProposal,
    markProposalSubmitted,
    clearPendingProposal,
  } = useAutopilot();
  const {
    network,
    setNetwork,
    connected,
    publicKey,
    disconnect,
    source,
    authState,
    accessMode,
    setAccessMode,
    isReadOnly,
    canExecuteManually,
    canAutopilotSubmit,
    hasExecutionWallet,
    lastWalletError,
  } = useWallet();
  const [copied, setCopied] = useState(false);
  const [manualReceiptId, setManualReceiptId] = useState<number | null>(null);
  const [manualReceiptStatus, setManualReceiptStatus] = useState<string | null>(null);
  const [autopilotReceiptId, setAutopilotReceiptId] = useState<number | null>(null);
  const [autopilotReceiptStatus, setAutopilotReceiptStatus] = useState<string | null>(null);

  const { data: txlineStatus, isLoading: statusLoading, refetch: refetchStatus } = useGetTxlineStatus({
    query: {
      refetchInterval: 30_000,
      queryKey: getGetTxlineStatusQueryKey(),
    },
  });

  const { data: txlineFixtures, isLoading: fixturesLoading } = useGetTxlineFixtures({
    query: {
      enabled: txlineStatus?.connected === true,
      refetchInterval: 60_000,
      queryKey: getGetTxlineFixturesQueryKey(),
    },
  });

  const { subscribe, reset, step: subStep, error: subError, newToken } = useTxlineSubscribe();
  const createReceiptMutation = useCreateReceipt();
  const updateReceiptLifecycleMutation = useUpdateReceiptLifecycle();

  const isConnected = txlineStatus?.connected;
  const fixtureCount = txlineFixtures?.length ?? txlineStatus?.fixtureCount ?? 0;
  const isSubscribing = !["idle", "done", "error"].includes(subStep);
  const executionBusy = createReceiptMutation.isPending || updateReceiptLifecycleMutation.isPending;
  const txlineActionAllowed = hasExecutionWallet && !isReadOnly;
  const referenceFixtureId = txlineFixtures?.[0]?.fixtureId ?? 11001;
  const referenceActionSummary = useMemo(() => {
    const firstFixture = txlineFixtures?.[0];
    if (!firstFixture) {
      return "EXECUTE best available spread on top-scored live fixture";
    }

    return `EXECUTE ${firstFixture.homeTeam} vs ${firstFixture.awayTeam} spread position`;
  }, [txlineFixtures]);
  const referenceReason = useMemo(
    () => pendingProposal?.reason ?? "Consensus cleared the configured threshold and no Sentinel veto is active.",
    [pendingProposal]
  );
  const referenceRiskContext = useMemo(
    () =>
      pendingProposal?.riskContext ??
      `Edge threshold ${threshold}, network ${network}, kill switch ${hardLocked ? "engaged" : "clear"}.`,
    [hardLocked, network, pendingProposal, threshold]
  );
  const walletStatusLabel = connected && publicKey
    ? source === "phantom"
      ? "Phantom Connected"
      : "Observer Address Loaded"
    : "No Wallet Connected";
  const autopilotSubmissionAllowed =
    canAutopilotSubmit && canSubmitAutopilotTransaction({ accessMode, autopilotExecutionState });

  const syncReceiptQueries = async () => {
    await queryClient.invalidateQueries({
      queryKey: getListReceiptsQueryKey({ limit: 50 }),
    });
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const truncateAddress = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

  const handleModeChange = (nextMode: WalletAccessMode) => {
    try {
      if (hardLocked && nextMode !== "read_only") {
        throw new Error("The hardware kill switch is engaged. Unlock it before enabling execution modes.");
      }

      if (nextMode !== "read_only" && !hasExecutionWallet) {
        throw new Error("Connect Phantom before enabling manual or autopilot execution modes.");
      }

      setAccessMode(nextMode);

      if (nextMode === "read_only" || nextMode === "wallet_connected_manual") {
        setAutopilotEnabled(false);
        setAutopilotExecutionState("disabled");
        clearPendingProposal();
      } else {
        setAutopilotEnabled(true);
        setAutopilotExecutionState(
          nextMode === "wallet_connected_autopilot_active" && pendingProposal
            ? "approved_for_submission"
            : pendingProposal
              ? "proposal_pending_approval"
              : "monitoring_only"
        );
      }
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Mode Change Blocked",
        description: error instanceof Error ? error.message : "Unable to change access mode.",
      });
    }
  };

  const handleManualSubmit = async () => {
    try {
      assertManualExecutionAllowed(accessMode);

      const receipt = await createReceiptMutation.mutateAsync({
        data: {
          alertId: null,
          fixtureId: referenceFixtureId,
          txSignature: null,
          memoJson: {
            actionSummary: referenceActionSummary,
            reason: referenceReason,
            riskContext: referenceRiskContext,
            confidence: 0.84,
            source: "manual_execution",
          },
          cluster: network,
          status: "submitted",
          executionMode: "manual",
          proposalStatus: "approved",
          approvedBy: publicKey ?? "manual-operator",
        },
      });

      setManualReceiptId(receipt.id);
      setManualReceiptStatus(receipt.status);
      await syncReceiptQueries();
      toast({
        title: "Manual Submission Recorded",
        description: "The recommendation is approved and marked as submitted.",
      });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Manual Submission Blocked",
        description: error instanceof Error ? error.message : "Unable to submit the manual action.",
      });
    }
  };

  const handleManualLifecycle = async (action: "confirm" | "fail") => {
    if (!manualReceiptId) {
      return;
    }

    try {
      const receipt = await updateReceiptLifecycleMutation.mutateAsync({
        receiptId: manualReceiptId,
        data: { action },
      });

      setManualReceiptStatus(receipt.status);
      await syncReceiptQueries();
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Manual Lifecycle Update Failed",
        description: error instanceof Error ? error.message : "Unable to update the manual receipt lifecycle.",
      });
    }
  };

  const handleCreateAutopilotProposal = async () => {
    try {
      if (hardLocked) {
        throw new Error("Kill switch is engaged. Autopilot proposals are disabled.");
      }

      if (!hasExecutionWallet) {
        throw new Error("Connect Phantom before creating autopilot proposals.");
      }

      if (accessMode !== "wallet_connected_autopilot_pending_approval") {
        throw new Error("Switch to Autopilot Waiting Approval before creating a proposal.");
      }

      const receipt = await createReceiptMutation.mutateAsync({
        data: {
          alertId: null,
          fixtureId: referenceFixtureId,
          txSignature: null,
          memoJson: {
            actionSummary: referenceActionSummary,
            reason: referenceReason,
            riskContext: referenceRiskContext,
            confidence: 0.91,
            source: "autopilot_proposal",
          },
          cluster: network,
          status: "proposed",
          executionMode: "autopilot",
          proposalStatus: "proposed",
        },
      });

      requestAutopilotApproval({
        id: `proposal-${receipt.id}`,
        receiptId: receipt.id,
        fixtureId: referenceFixtureId,
        actionSummary: referenceActionSummary,
        reason: referenceReason,
        confidence: 0.91,
        riskContext: referenceRiskContext,
        createdAt: new Date().toISOString(),
      });
      setAutopilotReceiptId(receipt.id);
      setAutopilotReceiptStatus(receipt.status);
      setAutopilotEnabled(true);
      setAutopilotExecutionState("proposal_pending_approval");
      await syncReceiptQueries();
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Proposal Blocked",
        description: error instanceof Error ? error.message : "Unable to create the autopilot proposal.",
      });
    }
  };

  const handleApproveAutopilot = async () => {
    if (!pendingProposal?.receiptId) {
      return;
    }

    try {
      const receipt = await updateReceiptLifecycleMutation.mutateAsync({
        receiptId: pendingProposal.receiptId,
        data: {
          action: "approve",
          approvedBy: publicKey ?? "autopilot-operator",
        },
      });

      approveAutopilotProposal(pendingProposal.id);
      setAccessMode("wallet_connected_autopilot_active");
      setAutopilotExecutionState("approved_for_submission");
      setAutopilotReceiptStatus(receipt.status);
      await syncReceiptQueries();
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Approval Failed",
        description: error instanceof Error ? error.message : "Unable to approve the autopilot proposal.",
      });
    }
  };

  const handleRejectAutopilot = async () => {
    if (!pendingProposal?.receiptId) {
      return;
    }

    try {
      const receipt = await updateReceiptLifecycleMutation.mutateAsync({
        receiptId: pendingProposal.receiptId,
        data: { action: "veto" },
      });

      rejectAutopilotProposal(pendingProposal.id);
      setAutopilotReceiptStatus(receipt.status);
      await syncReceiptQueries();
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Veto Failed",
        description: error instanceof Error ? error.message : "Unable to veto the autopilot proposal.",
      });
    }
  };

  const handleSubmitApprovedAutopilot = async () => {
    if (!pendingProposal?.receiptId) {
      return;
    }

    try {
      if (!autopilotSubmissionAllowed) {
        throw new Error("Autopilot submission requires active mode plus an approved proposal.");
      }

      const receipt = await updateReceiptLifecycleMutation.mutateAsync({
        receiptId: pendingProposal.receiptId,
        data: { action: "submit" },
      });

      markProposalSubmitted(pendingProposal.id);
      setAutopilotReceiptStatus(receipt.status);
      await syncReceiptQueries();
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Submission Blocked",
        description: error instanceof Error ? error.message : "Unable to submit the approved autopilot proposal.",
      });
    }
  };

  const handleAutopilotLifecycle = async (action: "confirm" | "fail") => {
    if (!autopilotReceiptId) {
      return;
    }

    try {
      const receipt = await updateReceiptLifecycleMutation.mutateAsync({
        receiptId: autopilotReceiptId,
        data: { action },
      });

      setAutopilotReceiptStatus(receipt.status);
      clearPendingProposal();
      setAutopilotExecutionState("monitoring_only");
      await syncReceiptQueries();
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Autopilot Lifecycle Update Failed",
        description: error instanceof Error ? error.message : "Unable to update the autopilot receipt lifecycle.",
      });
    }
  };

  return (
    <div className="flex flex-col gap-6 h-full max-w-4xl pb-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
          <Settings className="w-6 h-6 text-primary" />
          SYSTEM_PARAMS
        </h1>
        <p className="text-sm font-mono text-muted-foreground">Control wallet access, manual approvals, autopilot gating, and network settings without blocking read-only observation.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-card/40 border-border/50 md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="font-mono text-sm uppercase flex items-center gap-2">
              <Wallet className="w-4 h-4 text-purple-400" /> Wallet Connection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-background border border-border/50">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${hasExecutionWallet ? "bg-green-400 animate-pulse" : connected ? "bg-blue-400" : "bg-slate-500"}`} />
                <div>
                  <div className={`font-mono text-sm font-semibold ${hasExecutionWallet ? "text-green-400" : "text-slate-300"}`}>
                    {walletStatusLabel}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {publicKey ? truncateAddress(publicKey) : "Observer access stays available without wallet auth."}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-[10px] border-purple-400/50 text-purple-400">
                  {network.toUpperCase()}
                </Badge>
                {connected && (
                  <Button variant="ghost" size="sm" className="font-mono text-xs text-muted-foreground hover:text-destructive" onClick={() => disconnect()}>
                    Disconnect
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border border-border/50 bg-background p-3">
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Wallet Auth</div>
                <div className="mt-2 font-mono text-sm">{AUTH_STATE_LABELS[authState]}</div>
              </div>
              <div className="rounded-lg border border-border/50 bg-background p-3">
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Access Mode</div>
                <div className="mt-2 font-mono text-sm">{MODE_OPTIONS.find((option) => option.value === accessMode)?.label}</div>
              </div>
              <div className="rounded-lg border border-border/50 bg-background p-3">
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Execution Wallet</div>
                <div className="mt-2 font-mono text-sm">{hasExecutionWallet ? "Ready" : "Read-only only"}</div>
              </div>
            </div>

            {lastWalletError && (
              <Alert variant="destructive" className="bg-destructive/10 border-destructive/30">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="font-mono text-xs">{lastWalletError}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/40 border-border/50">
          <CardHeader>
            <CardTitle className="font-mono text-sm uppercase flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" /> Access Control
            </CardTitle>
            <CardDescription className="font-mono text-xs">Read-only stays available even when wallet auth is absent or restore fails.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup value={accessMode} onValueChange={(value) => handleModeChange(value as WalletAccessMode)} className="space-y-3">
              {MODE_OPTIONS.map((option) => {
                const disabled = option.value !== "read_only" && (!hasExecutionWallet || hardLocked);

                return (
                  <div key={option.value} className={`flex items-start space-x-3 border rounded-lg p-4 bg-background ${disabled ? "opacity-60" : ""}`}>
                    <RadioGroupItem value={option.value} id={option.value} disabled={disabled} />
                    <Label htmlFor={option.value} className="flex-1 cursor-pointer font-mono">
                      <div className="font-bold">{option.label}</div>
                      <div className="text-xs text-muted-foreground mt-1">{option.helper}</div>
                      {option.value !== "read_only" && !hasExecutionWallet && (
                        <div className="text-[10px] text-yellow-400 mt-2">Connect Phantom to unlock this mode.</div>
                      )}
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
          </CardContent>
        </Card>

        <Card className="bg-card/40 border-border/50">
          <CardHeader>
            <CardTitle className="font-mono text-sm uppercase flex items-center gap-2">
              <Cpu className="w-4 h-4 text-primary" /> Autopilot Config
            </CardTitle>
            <CardDescription className="font-mono text-xs">Monitoring and recommendation generation stay separate from submission authority.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="font-mono">Autopilot Monitoring</Label>
                <div className="text-xs text-muted-foreground font-mono">Allow scoring and proposal generation without automatic submission.</div>
              </div>
              <Switch
                checked={autopilotEnabled}
                onCheckedChange={(checked) => {
                  setAutopilotEnabled(checked);
                  if (!checked) {
                    handleModeChange("read_only");
                  } else if (hasExecutionWallet) {
                    handleModeChange("wallet_connected_autopilot_pending_approval");
                  }
                }}
                disabled={hardLocked || !hasExecutionWallet}
                className="data-[state=checked]:bg-primary"
              />
            </div>

            <div className="rounded-lg border border-border/50 bg-background p-3 flex items-center justify-between">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Execution State</div>
                <div className="font-mono text-sm mt-1">{AUTOPILOT_STATE_LABELS[autopilotExecutionState]}</div>
              </div>
              <Badge variant="outline" className="font-mono text-[10px] border-primary/30 text-primary">
                {autopilotSubmissionAllowed ? "Submission Ready" : "Approval Required"}
              </Badge>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="font-mono">Execution Edge Threshold</Label>
                <span className="font-mono text-primary font-bold">{threshold}</span>
              </div>
              <Slider
                value={[threshold]}
                onValueChange={(value) => setThreshold(value[0])}
                max={100}
                min={50}
                step={1}
                disabled={hardLocked}
              />
              <p className="text-xs text-muted-foreground font-mono">Minimum edge score required before manual or autopilot flows surface a recommendation.</p>
            </div>

            <div className="space-y-3 pt-4 border-t border-border/50">
              <Label className="font-mono">Slippage Tolerance (%)</Label>
              <div className="flex items-center gap-2">
                <Input type="number" defaultValue={2.5} className="font-mono w-24 bg-background" disabled={hardLocked} />
                <span className="text-muted-foreground font-mono text-sm">%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/40 border-border/50">
          <CardHeader>
            <CardTitle className="font-mono text-sm uppercase flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-destructive" /> Hardware Kill Switch
            </CardTitle>
            <CardDescription className="font-mono text-xs">Emergency overrides</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-destructive/10 border border-destructive/30 rounded-md p-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="font-mono text-destructive font-bold uppercase tracking-wider">Master Lock</Label>
                <Switch
                  checked={hardLocked}
                  onCheckedChange={setHardLocked}
                  className="data-[state=checked]:bg-destructive"
                />
              </div>
              <p className="text-xs text-destructive/80 font-mono">
                Immediately halts outgoing transactions, disables autopilot submission authority, and preserves read-only dashboard visibility.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/40 border-border/50 md:col-span-2">
          <CardHeader>
            <CardTitle className="font-mono text-sm uppercase flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-400" /> Manual Execution Flow
            </CardTitle>
            <CardDescription className="font-mono text-xs">Manual submission requires explicit approval and remains blocked in read-only mode.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border/50 bg-background p-4 space-y-2">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Recommendation</div>
              <div className="font-mono text-sm font-semibold">{referenceActionSummary}</div>
              <div className="font-mono text-xs text-muted-foreground">Reason: {referenceReason}</div>
              <div className="font-mono text-xs text-muted-foreground">Risk: {referenceRiskContext}</div>
              <div className="flex items-center gap-2 pt-2">
                <Badge variant="outline" className="font-mono text-[10px] border-emerald-500/30 text-emerald-400">
                  {canExecuteManually ? "Ready To Submit" : "Manual Approval Required"}
                </Badge>
                {manualReceiptStatus && (
                  <Badge variant="outline" className="font-mono text-[10px] border-border/50 text-muted-foreground">
                    Receipt {manualReceiptStatus}
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button className="font-mono" onClick={handleManualSubmit} disabled={!canExecuteManually || executionBusy}>
                Approve &amp; Submit
              </Button>
              <Button variant="outline" className="font-mono" onClick={() => handleManualLifecycle("confirm")} disabled={!manualReceiptId || manualReceiptStatus !== "submitted" || executionBusy}>
                Mark Confirmed
              </Button>
              <Button variant="outline" className="font-mono" onClick={() => handleManualLifecycle("fail")} disabled={!manualReceiptId || manualReceiptStatus !== "submitted" || executionBusy}>
                Mark Failed
              </Button>
            </div>

            {isReadOnly && (
              <Alert className="bg-yellow-500/10 border-yellow-500/30">
                <AlertTriangle className="h-4 w-4 text-yellow-400" />
                <AlertDescription className="font-mono text-xs text-yellow-300">
                  Read-only mode keeps recommendations visible, but no real execution path is allowed.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/40 border-border/50 md:col-span-2">
          <CardHeader>
            <CardTitle className="font-mono text-sm uppercase flex items-center gap-2">
              <Bot className="w-4 h-4 text-primary" /> Approval-Gated Autopilot
            </CardTitle>
            <CardDescription className="font-mono text-xs">Autopilot may monitor, score, suggest, and create proposals, but it may not submit until approved.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border/50 bg-background p-4">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Pending Proposal</div>
              {pendingProposal ? (
                <div className="mt-2 space-y-2">
                  <div className="font-mono text-sm font-semibold">{pendingProposal.actionSummary}</div>
                  <div className="font-mono text-xs text-muted-foreground">Reason: {pendingProposal.reason}</div>
                  <div className="font-mono text-xs text-muted-foreground">Confidence: {(pendingProposal.confidence * 100).toFixed(0)}%</div>
                  <div className="font-mono text-xs text-muted-foreground">Risk: {pendingProposal.riskContext}</div>
                  <div className="flex items-center gap-2 pt-2">
                    <Badge variant="outline" className="font-mono text-[10px] border-primary/30 text-primary">
                      {AUTOPILOT_STATE_LABELS[autopilotExecutionState]}
                    </Badge>
                    {autopilotReceiptStatus && (
                      <Badge variant="outline" className="font-mono text-[10px] border-border/50 text-muted-foreground">
                        Receipt {autopilotReceiptStatus}
                      </Badge>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-2 font-mono text-xs text-muted-foreground">No autopilot proposal is awaiting approval.</div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button className="font-mono" variant="outline" onClick={handleCreateAutopilotProposal} disabled={accessMode !== "wallet_connected_autopilot_pending_approval" || Boolean(pendingProposal) || executionBusy}>
                Create Proposal
              </Button>
              <Button className="font-mono" onClick={handleApproveAutopilot} disabled={!pendingProposal || autopilotExecutionState !== "proposal_pending_approval" || executionBusy}>
                Approve
              </Button>
              <Button variant="outline" className="font-mono" onClick={handleRejectAutopilot} disabled={!pendingProposal || executionBusy}>
                Reject / Veto
              </Button>
              <Button className="font-mono" variant="secondary" onClick={handleSubmitApprovedAutopilot} disabled={!pendingProposal || !autopilotSubmissionAllowed || executionBusy}>
                Submit Approved Proposal
              </Button>
              <Button variant="outline" className="font-mono" onClick={() => handleAutopilotLifecycle("confirm")} disabled={!autopilotReceiptId || autopilotReceiptStatus !== "submitted" || executionBusy}>
                Mark Confirmed
              </Button>
              <Button variant="outline" className="font-mono" onClick={() => handleAutopilotLifecycle("fail")} disabled={!autopilotReceiptId || autopilotReceiptStatus !== "submitted" || executionBusy}>
                Mark Failed
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/40 border-border/50 md:col-span-2">
          <CardHeader>
            <CardTitle className="font-mono text-sm uppercase flex items-center gap-2">
              <Globe className="w-4 h-4 text-accent" /> Network Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup value={network} onValueChange={(value) => setNetwork(value as "mainnet" | "devnet")} className="flex flex-col gap-4">
              <div className="flex items-center space-x-2 border rounded-lg p-4 bg-background cursor-pointer hover:border-primary/50 transition-colors">
                <RadioGroupItem value="mainnet" id="mainnet" />
                <Label htmlFor="mainnet" className="flex-1 cursor-pointer font-mono">
                  <div className="font-bold">Mainnet Beta</div>
                  <div className="text-xs text-muted-foreground mt-1">Live execution with real funds. Requires Phantom plus a non-read-only access mode.</div>
                </Label>
              </div>
              <div className="flex items-center space-x-2 border rounded-lg p-4 bg-background cursor-pointer hover:border-primary/50 transition-colors">
                <RadioGroupItem value="devnet" id="devnet" />
                <Label htmlFor="devnet" className="flex-1 cursor-pointer font-mono">
                  <div className="font-bold">Devnet</div>
                  <div className="text-xs text-muted-foreground mt-1">Testing environment. TxLINE oracle runs on devnet.</div>
                </Label>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>

        <Card className="bg-card/40 border-border/50 md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="font-mono text-sm uppercase flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-green-500" /> TxLINE Live Feed
              </CardTitle>
              <CardDescription className="font-mono text-xs mt-1">
                Real-time cryptographically verifiable sports data · DVR-buffered on-chain oracle
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="font-mono text-xs" onClick={() => refetchStatus()} disabled={statusLoading}>
              <RefreshCw className={`w-3 h-3 mr-1 ${statusLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-background border border-border/50">
              <div className="flex items-center gap-3">
                {statusLoading ? (
                  <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                ) : isConnected ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-destructive" />
                )}
                <div>
                  <div className="font-mono text-sm font-semibold">
                    {statusLoading ? "Connecting…" : isConnected ? "FEED ACTIVE" : "FEED OFFLINE"}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {isConnected
                      ? "TxODDS · Solana Devnet · Cryptographic proofs enabled"
                      : txlineStatus?.error
                        ? `Error: ${txlineStatus.error.slice(0, 80)}`
                        : "Unable to reach TxLINE API"}
                  </div>
                </div>
              </div>
              <Badge
                variant="outline"
                className={`font-mono text-xs ${
                  isConnected
                    ? "border-green-500/50 text-green-500 bg-green-500/10"
                    : "border-destructive/50 text-destructive bg-destructive/10"
                }`}
              >
                {isConnected ? "● LIVE" : "○ OFFLINE"}
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-background border border-border/50 text-center">
                <div className="font-mono text-2xl font-bold text-primary">
                  {fixturesLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : fixtureCount}
                </div>
                <div className="font-mono text-xs text-muted-foreground mt-1">Live Fixtures</div>
              </div>
              <div className="p-3 rounded-lg bg-background border border-border/50 text-center">
                <div className="font-mono text-2xl font-bold text-accent">DVR</div>
                <div className="font-mono text-xs text-muted-foreground mt-1">5s Polling Active</div>
              </div>
              <div className="p-3 rounded-lg bg-background border border-border/50 text-center">
                <div className={`font-mono text-2xl font-bold ${txlineStatus?.tokenConfigured ? "text-green-400" : "text-destructive"}`}>
                  {txlineStatus?.tokenConfigured ? <CheckCircle2 className="w-6 h-6 mx-auto" /> : <XCircle className="w-6 h-6 mx-auto" />}
                </div>
                <div className="font-mono text-xs text-muted-foreground mt-1">API Token</div>
              </div>
            </div>

            {isConnected && txlineFixtures && txlineFixtures.length > 0 && (
              <div className="space-y-2">
                <div className="font-mono text-xs text-muted-foreground uppercase tracking-wider">Available Fixtures</div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {txlineFixtures.slice(0, 20).map((fixture) => (
                    <div key={fixture.fixtureId} className="flex items-center justify-between px-3 py-2 rounded bg-background border border-border/30 text-xs font-mono">
                      <span>
                        <span className="text-primary font-semibold">{fixture.homeTeam}</span>
                        <span className="text-muted-foreground mx-2">vs</span>
                        <span className="text-primary font-semibold">{fixture.awayTeam}</span>
                      </span>
                      <div className="flex items-center gap-2">
                        {fixture.status && (
                          <Badge variant="outline" className={`text-[10px] ${fixture.status.toLowerCase().includes("live") ? "border-green-500/50 text-green-400" : "border-border/50 text-muted-foreground"}`}>
                            {fixture.status}
                          </Badge>
                        )}
                        <span className="text-muted-foreground text-[10px]">#{fixture.fixtureId}</span>
                      </div>
                    </div>
                  ))}
                  {txlineFixtures.length > 20 && (
                    <div className="text-center text-xs text-muted-foreground font-mono py-1">
                      + {txlineFixtures.length - 20} more fixtures
                    </div>
                  )}
                </div>
              </div>
            )}

            {isConnected && (!txlineFixtures || txlineFixtures.length === 0) && !fixturesLoading && (
              <div className="text-center text-xs text-muted-foreground font-mono py-4 border border-dashed border-border/50 rounded-lg">
                <Wifi className="w-6 h-6 mx-auto mb-2 opacity-40" />
                No live fixtures right now — check back during match windows
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/40 border-border/50 md:col-span-2">
          <CardHeader>
            <CardTitle className="font-mono text-sm uppercase flex items-center gap-2">
              <Key className="w-4 h-4 text-yellow-400" /> TxLINE On-Chain Subscription
            </CardTitle>
            <CardDescription className="font-mono text-xs mt-1">
              Subscribe to TxLINE via the TxOracle Solana program to receive a fresh API token. Requires Phantom plus a non-read-only access mode.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-2">
              {[
                { icon: "1", label: "Get JWT", active: subStep === "getting-jwt" },
                { icon: "2", label: "On-chain tx", active: subStep === "subscribing" },
                { icon: "3", label: "Sign msg", active: subStep === "signing" },
                { icon: "4", label: "Activate", active: subStep === "activating" },
              ].map((step, index) => (
                <div key={index} className={`p-2 rounded border text-center text-xs font-mono transition-colors ${step.active ? "border-primary/70 bg-primary/10 text-primary" : "border-border/30 text-muted-foreground"}`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mx-auto mb-1 ${step.active ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{step.icon}</div>
                  {step.label}
                </div>
              ))}
            </div>

            {!hasExecutionWallet && (
              <Alert className="bg-yellow-500/10 border-yellow-500/30">
                <AlertTriangle className="h-4 w-4 text-yellow-400" />
                <AlertDescription className="font-mono text-xs text-yellow-400/80">
                  Connect Phantom before sending on-chain subscription transactions.
                </AlertDescription>
              </Alert>
            )}

            {hasExecutionWallet && isReadOnly && (
              <Alert className="bg-yellow-500/10 border-yellow-500/30">
                <AlertTriangle className="h-4 w-4 text-yellow-400" />
                <AlertDescription className="font-mono text-xs text-yellow-400/80">
                  Read-only mode is active. Switch to Manual or approved Autopilot mode before sending on-chain subscription transactions.
                </AlertDescription>
              </Alert>
            )}

            {subStep === "error" && subError && (
              <Alert variant="destructive" className="bg-destructive/10 border-destructive/30">
                <XCircle className="h-4 w-4" />
                <AlertTitle className="font-mono text-xs font-bold">Subscription Failed</AlertTitle>
                <AlertDescription className="font-mono text-xs">{subError}</AlertDescription>
              </Alert>
            )}

            {subStep === "done" && newToken && (
              <div className="space-y-3">
                <Alert className="bg-green-500/10 border-green-500/30">
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                  <AlertTitle className="font-mono text-xs font-bold text-green-400">Subscription Activated!</AlertTitle>
                  <AlertDescription className="font-mono text-xs text-green-400/80">
                    Your new TxLINE API token is shown below. Store it as your <code>TXLINE_API_TOKEN</code> secret.
                  </AlertDescription>
                </Alert>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-background border border-green-500/30 font-mono text-xs">
                  <code className="flex-1 text-green-400 break-all">{newToken}</code>
                  <Button size="sm" variant="ghost" className="shrink-0" onClick={() => copyToken(newToken)}>
                    {copied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button className="font-mono flex-1" variant={subStep === "done" ? "outline" : "default"} disabled={!txlineActionAllowed || isSubscribing} onClick={subStep === "done" || subStep === "error" ? reset : subscribe}>
                {isSubscribing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {STEP_LABELS[subStep]}
                  </>
                ) : (
                  <>
                    <ChevronRight className="w-4 h-4 mr-2" />
                    {STEP_LABELS[subStep] ?? "Subscribe"}
                  </>
                )}
              </Button>
              <a
                href="https://txline-docs.txodds.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-border/50 text-xs font-mono text-muted-foreground hover:text-foreground hover:border-border transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Docs
              </a>
            </div>

            <p className="text-xs text-muted-foreground font-mono">
              Program: <code className="text-primary">6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J</code> · TxL Mint: <code className="text-primary">4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG</code>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
