import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/ui/button";
import { Badge } from "@/ui/badge";
import { Checkbox } from "@/ui/checkbox";
import { Input } from "@/ui/input";
import { Progress } from "@/ui/progress";
import {
  ArrowLeft,
  Check,
  X,
  Sparkles,
  Mail,
  Search,
  Loader2,
  CheckCircle2,
  Building2,
  ThumbsDown,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useActiveBackfill,
  useBackfillStatus,
  useBackfillTick,
  useCancelBackfill,
  useBackfillEnrich,
} from "@/api/useBackfill";
import {
  useSupplierCandidates,
  useBulkAcceptCandidates,
  useBulkDismissCandidates,
} from "@/api/useSupplierCandidates";

// Animated progress component
function AnimatedProgress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <Progress value={value} className="h-3" />
      <div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"
        style={{
          backgroundSize: "200% 100%",
          animation: value < 100 ? "shimmer 2s linear infinite" : "none",
        }}
      />
    </div>
  );
}

// Confidence badge
function ConfidenceBadge({ confidence, isRelevant }: { confidence: number | null; isRelevant?: boolean | null }) {
  if (confidence === null) {
    return <Badge variant="outline" className="text-xs">—</Badge>;
  }
  
  if (isRelevant === false) {
    return (
      <Badge variant="outline" className="text-xs bg-slate-100 text-slate-500 border-slate-200 gap-1">
        <ThumbsDown className="h-2.5 w-2.5" />
        Not relevant
      </Badge>
    );
  }

  const percent = Math.round(confidence * 100);
  const color =
    percent >= 80
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : percent >= 50
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-slate-100 text-slate-600 border-slate-200";

  return (
    <Badge variant="outline" className={cn("text-xs", color)}>
      {percent}%
    </Badge>
  );
}

// Category badges with primary indicator
function CategoryBadges({ categories, primary }: { categories: string[]; primary?: string | null }) {
  if (!categories || categories.length === 0) {
    return <span className="text-muted-foreground italic">—</span>;
  }

  // Format slug to display name
  const formatName = (slug: string) =>
    slug.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <div className="flex flex-wrap gap-1">
      {categories.map((cat) => (
        <Badge
          key={cat}
          variant={cat === primary ? "default" : "secondary"}
          className={cn("font-normal text-xs", cat === primary && "gap-0.5")}
        >
          {cat === primary && <Star className="h-2.5 w-2.5" />}
          {formatName(cat)}
        </Badge>
      ))}
    </div>
  );
}

export default function InboxImportPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const runIdParam = searchParams.get("runId");

  const { data: activeBackfill } = useActiveBackfill();
  const runId = runIdParam || activeBackfill?.activeRun?.id || null;
  const { data: runStatus } = useBackfillStatus(runId);
  const tick = useBackfillTick();
  const cancelBackfill = useCancelBackfill();
  const enrichBackfill = useBackfillEnrich();

  const { data: candidates, isLoading: loadingCandidates } = useSupplierCandidates("NEW");
  const bulkAccept = useBulkAcceptCandidates();
  const bulkDismiss = useBulkDismissCandidates();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [enrichmentStarted, setEnrichmentStarted] = useState(false);

  // Filter to only show relevant candidates
  const relevantCandidates = useMemo(() => {
    if (!candidates) return [];
    // Show candidates that are either not enriched yet, or are relevant
    return candidates.filter((c) => c.isRelevant !== false);
  }, [candidates]);

  // Auto-tick loop for discovery phase
  useEffect(() => {
    if (!runId || !runStatus) return;
    if (runStatus.status !== "PENDING" && runStatus.status !== "RUNNING") return;
    if (tick.isPending || isProcessing) return;

    const timer = setTimeout(() => {
      setIsProcessing(true);
      tick.mutateAsync(runId).finally(() => setIsProcessing(false));
    }, 500);

    return () => clearTimeout(timer);
  }, [runId, runStatus?.status, tick.isPending, isProcessing]);

  // Auto-trigger enrichment when discovery completes
  useEffect(() => {
    if (!runId || !runStatus) return;
    if (runStatus.status !== "COMPLETED") return;
    if (runStatus.enrichmentStatus !== "PENDING") return;
    if (enrichmentStarted || enrichBackfill.isPending) return;

    setEnrichmentStarted(true);
    enrichBackfill.mutate(runId);
  }, [runId, runStatus?.status, runStatus?.enrichmentStatus, enrichmentStarted, enrichBackfill.isPending]);

  // Auto-select high confidence relevant candidates
  useEffect(() => {
    if (!relevantCandidates) return;
    const highConfidence = relevantCandidates.filter(
      (c) => c.confidence !== null && c.confidence >= 0.65 && c.isRelevant === true && c.status === "NEW"
    );
    setSelectedIds(new Set(highConfidence.map((c) => c.id)));
  }, [relevantCandidates]);

  const filteredCandidates = useMemo(() => {
    if (!relevantCandidates) return [];
    if (!search) return relevantCandidates;
    const lower = search.toLowerCase();
    return relevantCandidates.filter(
      (c) =>
        c.email.toLowerCase().includes(lower) ||
        c.domain.toLowerCase().includes(lower) ||
        c.displayName?.toLowerCase().includes(lower) ||
        c.suggestedSupplierName?.toLowerCase().includes(lower) ||
        c.suggestedCategories?.some((cat) => cat.toLowerCase().includes(lower))
    );
  }, [relevantCandidates, search]);

  const isDiscovering =
    runStatus?.status === "PENDING" || runStatus?.status === "RUNNING";
  const isEnriching = runStatus?.enrichmentStatus === "RUNNING" || enrichBackfill.isPending;
  const isComplete = runStatus?.status === "COMPLETED" && runStatus?.enrichmentStatus === "COMPLETED";

  const discoveryProgress = runStatus
    ? runStatus.hasMorePages
      ? Math.min(90, (runStatus.scannedMessages / 500) * 100)
      : 100
    : 0;

  const handleSelectAll = () => {
    if (selectedIds.size === filteredCandidates.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCandidates.map((c) => c.id)));
    }
  };

  const handleToggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleAcceptSelected = async () => {
    if (selectedIds.size === 0) return;
    await bulkAccept.mutateAsync(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  const handleDismissSelected = async () => {
    if (selectedIds.size === 0) return;
    await bulkDismiss.mutateAsync(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <header className="px-6 py-4 border-b flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/inbox")} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-display font-semibold">Import Suppliers</h1>
          {runStatus && (
            <p className="text-sm text-muted-foreground">
              {isDiscovering
                ? `Scanning... ${runStatus.scannedMessages} emails checked`
                : isEnriching
                ? `Analyzing ${runStatus.createdCandidates} contacts with AI...`
                : isComplete
                ? `Found ${filteredCandidates.length} relevant suppliers`
                : runStatus.status}
            </p>
          )}
        </div>
        {isDiscovering && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => runId && cancelBackfill.mutate(runId)}
            disabled={cancelBackfill.isPending}
          >
            Cancel
          </Button>
        )}
      </header>

      {/* Discovery Progress Section */}
      {runStatus && isDiscovering && (
        <div className="px-6 py-8 border-b bg-gradient-to-b from-primary/5 to-transparent">
          <div className="max-w-xl mx-auto text-center space-y-6">
            <div className="relative inline-flex">
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
              <div className="relative p-4 rounded-full bg-primary/10">
                <Mail className="h-8 w-8 text-primary animate-bounce" />
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-display font-medium">
                Discovering your suppliers...
              </h2>
              <p className="text-muted-foreground">
                Scanning the last {runStatus.timeframeMonths} months of sent emails
              </p>
            </div>

            <AnimatedProgress value={discoveryProgress} className="max-w-md mx-auto" />

            <div className="flex justify-center gap-8 text-sm">
              <div className="text-center">
                <div className="text-2xl font-semibold text-foreground">
                  {runStatus.scannedMessages}
                </div>
                <div className="text-muted-foreground">Emails scanned</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-semibold text-primary">
                  {runStatus.createdCandidates}
                </div>
                <div className="text-muted-foreground">Contacts found</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Enrichment Progress Section */}
      {runStatus && !isDiscovering && isEnriching && (
        <div className="px-6 py-8 border-b bg-gradient-to-b from-violet-500/5 to-transparent">
          <div className="max-w-xl mx-auto text-center space-y-6">
            <div className="relative inline-flex">
              <div className="absolute inset-0 rounded-full bg-violet-500/20 animate-ping" />
              <div className="relative p-4 rounded-full bg-violet-500/10">
                <Sparkles className="h-8 w-8 text-violet-500 animate-pulse" />
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-display font-medium">
                AI is analyzing your contacts...
              </h2>
              <p className="text-muted-foreground">
                Identifying suppliers and categorizing them based on your event types
              </p>
            </div>

            <div className="flex justify-center gap-8 text-sm">
              <div className="text-center">
                <div className="text-2xl font-semibold text-violet-600">
                  {runStatus.enrichedCount || 0}
                </div>
                <div className="text-muted-foreground">Analyzed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-semibold text-emerald-600">
                  {runStatus.autoImportedCount || 0}
                </div>
                <div className="text-muted-foreground">Auto-imported</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Review Section */}
      {(isComplete || (filteredCandidates && filteredCandidates.length > 0 && !isDiscovering)) && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="px-6 py-3 border-b flex items-center gap-4 bg-muted/30">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search suppliers..."
                className="pl-9 h-9"
              />
            </div>
            <div className="flex-1" />
            <span className="text-sm text-muted-foreground">
              {selectedIds.size} selected
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDismissSelected}
              disabled={selectedIds.size === 0 || bulkDismiss.isPending}
              className="gap-1"
            >
              <X className="h-3 w-3" />
              Dismiss
            </Button>
            <Button
              size="sm"
              onClick={handleAcceptSelected}
              disabled={selectedIds.size === 0 || bulkAccept.isPending}
              className="gap-1"
            >
              {bulkAccept.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Import ({selectedIds.size})
            </Button>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto">
            {loadingCandidates ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredCandidates.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <CheckCircle2 className="h-12 w-12 text-emerald-500/30 mb-4" />
                <h3 className="font-medium text-foreground mb-1">All done!</h3>
                <p className="text-sm text-muted-foreground">
                  No more suppliers to review.
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => navigate("/suppliers")}
                >
                  View Suppliers
                </Button>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b sticky top-0">
                  <tr>
                    <th className="w-10 px-3 py-2">
                      <Checkbox
                        checked={selectedIds.size === filteredCandidates.length && filteredCandidates.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                      Name
                    </th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                      Email
                    </th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                      Categories
                    </th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                      Confidence
                    </th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                      Messages
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredCandidates.map((candidate) => (
                    <tr
                      key={candidate.id}
                      className={cn(
                        "hover:bg-muted/30 transition-colors",
                        selectedIds.has(candidate.id) && "bg-primary/5"
                      )}
                    >
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={selectedIds.has(candidate.id)}
                          onCheckedChange={() => handleToggle(candidate.id)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-md bg-muted">
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                          </div>
                          <span className="font-medium">
                            {candidate.suggestedSupplierName ||
                              candidate.displayName ||
                              candidate.email.split("@")[0]}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground font-mono text-xs">
                        {candidate.email}
                      </td>
                      <td className="px-3 py-2">
                        <CategoryBadges
                          categories={candidate.suggestedCategories || []}
                          primary={candidate.primaryCategory}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <ConfidenceBadge
                          confidence={candidate.confidence}
                          isRelevant={candidate.isRelevant}
                        />
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {candidate.messageCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Shimmer animation keyframes */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .animate-shimmer {
          animation: shimmer 2s linear infinite;
        }
      `}</style>
    </div>
  );
}
