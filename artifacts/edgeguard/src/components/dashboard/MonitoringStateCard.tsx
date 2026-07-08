import React from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type MonitoringStateCardProps = {
  title: string;
  description: string;
  value?: string;
  tone?: "default" | "warning" | "critical";
};

const toneClasses: Record<NonNullable<MonitoringStateCardProps["tone"]>, string> = {
  default: "border-border/50 bg-card/60",
  warning: "border-amber-500/30 bg-amber-500/5",
  critical: "border-destructive/30 bg-destructive/5",
};

const toneTextClasses: Record<NonNullable<MonitoringStateCardProps["tone"]>, string> = {
  default: "text-primary",
  warning: "text-amber-400",
  critical: "text-destructive",
};

const toneIcons = {
  default: Info,
  warning: AlertTriangle,
  critical: AlertTriangle,
} satisfies Record<NonNullable<MonitoringStateCardProps["tone"]>, React.ComponentType<{ className?: string }>>;

export function MonitoringStateCard({
  title,
  description,
  value,
  tone = "default",
}: MonitoringStateCardProps) {
  const Icon = toneIcons[tone] ?? CheckCircle2;

  return (
    <Card className={toneClasses[tone]}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-3 text-sm font-mono uppercase tracking-wider">
          <span className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${toneTextClasses[tone]}`} />
            {title}
          </span>
          {value ? <span className={`text-xs ${toneTextClasses[tone]}`}>{value}</span> : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
