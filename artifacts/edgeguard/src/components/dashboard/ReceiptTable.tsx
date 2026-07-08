import React from "react";
import { getListReceiptsQueryKey, useListReceipts, useRetryReceipt } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, RefreshCw, Copy, Check } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

export function ReceiptTable() {
  const receiptParams = { limit: 50 };
  const { data: receipts = [], isLoading } = useListReceipts(receiptParams, {
    query: {
      refetchInterval: 10000,
      queryKey: getListReceiptsQueryKey(receiptParams),
    },
  });
  
  const retryMutation = useRetryReceipt();
  const { toast } = useToast();
  const [copiedId, setCopiedId] = React.useState<number | null>(null);

  const statusClasses: Record<string, string> = {
    proposed: "bg-blue-500 text-blue-500",
    approved: "bg-purple-500 text-purple-500",
    submitted: "bg-amber-500 text-amber-500",
    confirmed: "bg-green-500 text-green-500",
    failed: "bg-red-500 text-red-500",
    vetoed: "bg-rose-500 text-rose-500",
  };

  const handleCopy = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({
      title: "Signature Copied",
      description: "Transaction signature copied to clipboard.",
    });
  };

  const handleRetry = (id: number) => {
    retryMutation.mutate({ receiptId: id }, {
      onSuccess: () => {
        toast({
          title: "Retry Initiated",
          description: "Receipt retry has been queued.",
        });
      },
      onError: (err: any) => {
        toast({
          variant: "destructive",
          title: "Retry Failed",
          description: err.message || "Failed to retry receipt.",
        });
      }
    });
  };

  if (isLoading && receipts.length === 0) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  return (
    <div className="border rounded-md bg-card/30 overflow-hidden">
      <Table>
        <TableHeader className="bg-muted/50 font-mono text-xs uppercase tracking-wider">
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Fixture</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Solana Tx</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="font-mono text-sm">
          {receipts.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                No receipts found in the audit trail.
              </TableCell>
            </TableRow>
          ) : (
            receipts.map((receipt) => (
              <TableRow key={receipt.id} className="hover:bg-muted/30">
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {format(new Date(receipt.ts), "HH:mm:ss.SSS")}
                </TableCell>
                <TableCell className="font-medium">
                  {receipt.fixture
                    ? `${receipt.fixture.homeTeam} vs ${receipt.fixture.awayTeam}`
                    : `Fixture #${receipt.alert?.fixtureId ?? "?"}`}
                </TableCell>
                <TableCell>
                  <Badge 
                    variant="outline" 
                    className={`text-[10px] tracking-wider rounded-sm ${
                      receipt.alert?.action.includes('EXECUTE') ? 'bg-green-500/10 text-green-500 border-green-500/50' :
                      receipt.alert?.action.includes('VETO') ? 'bg-red-500/10 text-red-500 border-red-500/50' : ''
                    }`}
                  >
                    {receipt.alert?.action || "UNKNOWN"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${statusClasses[receipt.status]?.split(" ")[0] ?? "bg-slate-500"} ${receipt.status === "submitted" ? "animate-pulse" : ""}`} />
                    <div className="flex flex-col">
                      <span className={`text-xs uppercase ${statusClasses[receipt.status]?.split(" ")[1] ?? "text-slate-300"}`}>
                        {receipt.status}
                      </span>
                      {(receipt.executionMode || receipt.proposalStatus) && (
                        <span className="text-[10px] text-muted-foreground uppercase">
                          {[receipt.executionMode, receipt.proposalStatus].filter(Boolean).join(" / ")}
                        </span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {receipt.txSignature ? (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground truncate max-w-[120px]" title={receipt.txSignature}>
                        {receipt.txSignature.slice(0, 8)}...{receipt.txSignature.slice(-8)}
                      </span>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={() => handleCopy(receipt.txSignature!, receipt.id)}
                      >
                        {copiedId === receipt.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs italic">
                      {receipt.status === "proposed" ? "Awaiting approval" : "Awaiting signature"}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {receipt.txSignature && (
                      <a 
                        href={`https://explorer.solana.com/tx/${receipt.txSignature}?cluster=${receipt.cluster}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:text-primary/80 transition-colors"
                        title="View on Explorer"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                    {(receipt.status === 'failed' || receipt.status === 'vetoed') && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 text-destructive hover:bg-destructive/10"
                        onClick={() => handleRetry(receipt.id)}
                        disabled={retryMutation.isPending}
                        title="Retry Transaction"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${retryMutation.isPending ? 'animate-spin' : ''}`} />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
