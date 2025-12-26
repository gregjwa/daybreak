import { useStatuses, useToggleStatus, type SupplierStatus } from "@/api/useStatuses";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/ui/card";
import { Switch } from "@/ui/switch";
import { Badge } from "@/ui/badge";
import { ArrowRight } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

function StatusCard({
  status,
  onToggle,
  isPending,
}: {
  status: SupplierStatus;
  onToggle: (enabled: boolean) => void;
  isPending: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 p-4 rounded-lg border transition-opacity",
        !status.isEnabled && "opacity-50"
      )}
    >
      <div
        className="w-4 h-4 rounded-full shrink-0"
        style={{ backgroundColor: status.color || "#6B7280" }}
      />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{status.name}</span>
          <Badge variant="outline" className="text-xs">
            #{status.order}
          </Badge>
        </div>
        {status.description && (
          <p className="text-sm text-muted-foreground truncate">
            {status.description}
          </p>
        )}
        
        {/* Detection signals */}
        {(status.inboundSignals.length > 0 || status.outboundSignals.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-1">
            {status.inboundSignals.slice(0, 3).map((signal, i) => (
              <Badge key={`in-${i}`} variant="secondary" className="text-xs">
                ↓ {signal}
              </Badge>
            ))}
            {status.outboundSignals.slice(0, 3).map((signal, i) => (
              <Badge key={`out-${i}`} variant="secondary" className="text-xs">
                ↑ {signal}
              </Badge>
            ))}
          </div>
        )}
      </div>
      
      <Switch
        checked={status.isEnabled}
        onCheckedChange={onToggle}
        disabled={isPending}
      />
    </div>
  );
}

export default function StatusConfigPage() {
  const { data, isLoading } = useStatuses();
  const toggleStatus = useToggleStatus();

  const statuses = data?.statuses || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Group statuses into phases
  const phases = [
    { name: "Discovery", range: [1, 3] },
    { name: "Negotiation", range: [4, 6] },
    { name: "Commitment", range: [7, 8] },
    { name: "Completion", range: [9, 10] },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Status Pipeline</h1>
        <p className="text-muted-foreground">
          Configure which statuses are active in your workflow. Disabled statuses won't be used for auto-detection.
        </p>
      </div>

      {/* Visual Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status Flow</CardTitle>
          <CardDescription>
            Your vendor journey from discovery to completion
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {statuses.map((status, index) => (
              <div key={status.slug} className="flex items-center">
                <div
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-opacity",
                    status.isEnabled ? "opacity-100" : "opacity-30"
                  )}
                  style={{
                    backgroundColor: `${status.color}20`,
                    color: status.color || "#6B7280",
                  }}
                >
                  {status.name}
                </div>
                {index < statuses.length - 1 && (
                  <ArrowRight className="h-4 w-4 mx-1 text-muted-foreground/50 shrink-0" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Status List by Phase */}
      <div className="space-y-6">
        {phases.map((phase) => {
          const phaseStatuses = statuses.filter(
            (s) => s.order >= phase.range[0] && s.order <= phase.range[1]
          );

          if (phaseStatuses.length === 0) return null;

          return (
            <Card key={phase.name}>
              <CardHeader>
                <CardTitle className="text-base">{phase.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {phaseStatuses.map((status) => (
                  <StatusCard
                    key={status.slug}
                    status={status}
                    onToggle={(enabled) =>
                      toggleStatus.mutate({ slug: status.slug, isEnabled: enabled })
                    }
                    isPending={toggleStatus.isPending}
                  />
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}


