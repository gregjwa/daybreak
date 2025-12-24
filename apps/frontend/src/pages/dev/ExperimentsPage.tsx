import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { getApiBaseUrl } from "@/lib/apiBase";
import { Button } from "@/ui/button";
import { Badge } from "@/ui/badge";
import { Textarea } from "@/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/table";
import {
  Flask,
  CheckCircle,
  XCircle,
  Clock,
  CurrencyDollar,
  Lightning,
  CaretRight,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const API_URL = getApiBaseUrl();

// Types
interface ExperimentStats {
  totalRuns: number;
  avgLatencyMs: number;
  totalCost: number;
  feedbackCount: number;
  accuracyRate: number | null;
}

interface Experiment {
  id: string;
  name: string;
  description: string | null;
  promptVersion: string;
  modelConfig: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  stats: ExperimentStats;
}

interface ExperimentRun {
  id: string;
  candidateEmail: string;
  candidateDomain: string;
  model: string;
  latencyMs: number;
  cost: number;
  hasFeedback: boolean;
  isCorrect: boolean | null;
  createdAt: string;
}

interface ExperimentDetail {
  experiment: Experiment;
  stats: ExperimentStats & {
    avgInputTokens: number;
    avgOutputTokens: number;
    correctCount: number;
  };
  recentRuns: ExperimentRun[];
}

interface RunDetail {
  id: string;
  experiment: { name: string; promptVersion: string };
  candidate: {
    email: string;
    domain: string;
    displayName: string | null;
    emailContextJson: unknown;
  };
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  cost: number;
  rawPrompt: string;
  rawResponse: string;
  resultJson: unknown;
  feedback: {
    isCorrect: boolean;
    correctedName: string | null;
    correctedCategories: string[] | null;
    notes: string | null;
  } | null;
  createdAt: string;
}

// Hooks
function useExperiments() {
  const { getToken } = useAuth();
  return useQuery<Experiment[]>({
    queryKey: ["experiments"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/enrichment/experiments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch experiments");
      return res.json();
    },
  });
}

function useExperimentDetail(id: string | null) {
  const { getToken } = useAuth();
  return useQuery<ExperimentDetail>({
    queryKey: ["experiments", id],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/enrichment/experiments/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch experiment");
      return res.json();
    },
    enabled: !!id,
  });
}

function useRunDetail(id: string | null) {
  const { getToken } = useAuth();
  return useQuery<RunDetail>({
    queryKey: ["enrichment-runs", id],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/enrichment/runs/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch run");
      return res.json();
    },
    enabled: !!id,
  });
}

function useSubmitFeedback() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      runId: string;
      isCorrect: boolean;
      correctedName?: string;
      correctedCategories?: string[];
      notes?: string;
    }) => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/enrichment/feedback`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to submit feedback");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["experiments"] });
      queryClient.invalidateQueries({ queryKey: ["enrichment-runs"] });
    },
  });
}

// Components

function RunTableRow({ 
  run, 
  onViewClick 
}: { 
  run: ExperimentRun; 
  onViewClick: () => void;
}) {
  const submitFeedback = useSubmitFeedback();
  
  const handleQuickFeedback = async (isCorrect: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await submitFeedback.mutateAsync({ runId: run.id, isCorrect });
    } catch (err) {
      console.error("Feedback error:", err);
    }
  };

  return (
    <TableRow className="hover:bg-muted/50">
      <TableCell className="font-mono text-xs">
        {run.candidateEmail}
      </TableCell>
      <TableCell className="text-muted-foreground text-xs">
        {run.candidateDomain}
      </TableCell>
      <TableCell className="text-xs">{run.latencyMs}ms</TableCell>
      <TableCell className="text-xs">
        ${run.cost.toFixed(4)}
      </TableCell>
      <TableCell>
        {run.hasFeedback ? (
          <div className="flex items-center gap-1">
            {run.isCorrect ? (
              <CheckCircle className="h-4 w-4 text-emerald-600" />
            ) : (
              <XCircle className="h-4 w-4 text-red-600" />
            )}
            <span className="text-xs text-muted-foreground">
              {run.isCorrect ? "Correct" : "Wrong"}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
              onClick={(e) => handleQuickFeedback(true, e)}
              disabled={submitFeedback.isPending}
              title="Mark as correct"
            >
              <CheckCircle className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={(e) => handleQuickFeedback(false, e)}
              disabled={submitFeedback.isPending}
              title="Mark as incorrect"
            >
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
        )}
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="sm"
          onClick={onViewClick}
        >
          View
        </Button>
      </TableCell>
    </TableRow>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  color = "default",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subtext?: string;
  color?: "default" | "success" | "warning" | "danger";
}) {
  const colors = {
    default: "text-muted-foreground",
    success: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-red-600",
  };

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("h-4 w-4", colors[color])} weight="duotone" />
        <span className="text-xs text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      {subtext && (
        <div className="text-xs text-muted-foreground mt-1">{subtext}</div>
      )}
    </div>
  );
}

function RunDetailModal({
  runId,
  onClose,
}: {
  runId: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useRunDetail(runId);
  const run = data as RunDetail | undefined;
  const submitFeedback = useSubmitFeedback();
  const [feedbackNotes, setFeedbackNotes] = useState("");

  const handleFeedback = async (isCorrect: boolean) => {
    await submitFeedback.mutateAsync({
      runId,
      isCorrect,
      notes: feedbackNotes || undefined,
    });
    onClose();
  };

  if (isLoading || !run) {
    return (
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </DialogContent>
    );
  }

  return (
    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <span>Run: {run.candidate.email}</span>
          {run.feedback && (
            <Badge variant={run.feedback.isCorrect ? "default" : "destructive"}>
              {run.feedback.isCorrect ? "Correct" : "Incorrect"}
            </Badge>
          )}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-6 py-4">
        {/* Metrics */}
        <div className="grid grid-cols-4 gap-3">
          <StatCard
            icon={Lightning}
            label="Latency"
            value={`${run.latencyMs}ms`}
          />
          <StatCard
            icon={CurrencyDollar}
            label="Cost"
            value={`$${run.cost.toFixed(4)}`}
          />
          <StatCard
            icon={Flask}
            label="Input Tokens"
            value={run.inputTokens}
          />
          <StatCard
            icon={Flask}
            label="Output Tokens"
            value={run.outputTokens}
          />
        </div>

        {/* Candidate Info */}
        <section>
          <h4 className="text-sm font-medium mb-2">Candidate</h4>
          <div className="rounded border p-3 bg-muted/50 text-sm space-y-1">
            <div>
              <span className="text-muted-foreground">Email: </span>
              {run.candidate.email}
            </div>
            <div>
              <span className="text-muted-foreground">Domain: </span>
              {run.candidate.domain}
            </div>
            {run.candidate.displayName && (
              <div>
                <span className="text-muted-foreground">Name: </span>
                {run.candidate.displayName}
              </div>
            )}
          </div>
        </section>

        {/* Email Context */}
        {run.candidate.emailContextJson != null && (
          <section>
            <h4 className="text-sm font-medium mb-2">Email Context</h4>
            <div className="rounded border p-3 bg-muted/50 text-xs font-mono max-h-32 overflow-y-auto">
              <pre>{String(JSON.stringify(run.candidate.emailContextJson, null, 2))}</pre>
            </div>
          </section>
        )}

        {/* Result */}
        <section>
          <h4 className="text-sm font-medium mb-2">AI Result</h4>
          <div className="rounded border p-3 bg-muted/50 text-xs font-mono max-h-48 overflow-y-auto">
            <pre>{String(JSON.stringify(run.resultJson, null, 2))}</pre>
          </div>
        </section>

        {/* Raw Prompt (collapsible) */}
        <details className="group">
          <summary className="text-sm font-medium cursor-pointer hover:text-primary">
            Raw Prompt{" "}
            <CaretRight className="inline h-4 w-4 transition-transform group-open:rotate-90" />
          </summary>
          <div className="mt-2 rounded border p-3 bg-muted/50 text-xs font-mono max-h-64 overflow-y-auto whitespace-pre-wrap">
            {run.rawPrompt}
          </div>
        </details>

        {/* Raw Response (collapsible) */}
        <details className="group">
          <summary className="text-sm font-medium cursor-pointer hover:text-primary">
            Raw Response{" "}
            <CaretRight className="inline h-4 w-4 transition-transform group-open:rotate-90" />
          </summary>
          <div className="mt-2 rounded border p-3 bg-muted/50 text-xs font-mono max-h-64 overflow-y-auto whitespace-pre-wrap">
            {run.rawResponse}
          </div>
        </details>

        {/* Feedback */}
        {!run.feedback && (
          <section className="border-t pt-4">
            <h4 className="text-sm font-medium mb-3">Submit Feedback</h4>
            <Textarea
              placeholder="Optional notes about the classification..."
              value={feedbackNotes}
              onChange={(e) => setFeedbackNotes(e.target.value)}
              className="mb-3"
              rows={2}
            />
            <div className="flex gap-2">
              <Button
                onClick={() => handleFeedback(true)}
                disabled={submitFeedback.isPending}
                className="gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                Mark Correct
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleFeedback(false)}
                disabled={submitFeedback.isPending}
                className="gap-2"
              >
                <XCircle className="h-4 w-4" />
                Mark Incorrect
              </Button>
            </div>
          </section>
        )}

        {/* Existing Feedback */}
        {run.feedback && (
          <section className="border-t pt-4">
            <h4 className="text-sm font-medium mb-2">Feedback</h4>
            <div className="rounded border p-3 bg-muted/50 text-sm">
              <div className="flex items-center gap-2 mb-2">
                {run.feedback.isCorrect ? (
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
                <span className="font-medium">
                  {run.feedback.isCorrect ? "Marked as Correct" : "Marked as Incorrect"}
                </span>
              </div>
              {run.feedback.notes && (
                <p className="text-muted-foreground">{run.feedback.notes}</p>
              )}
            </div>
          </section>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export default function ExperimentsPage() {
  const { data: experiments, isLoading, refetch } = useExperiments();
  const [selectedExperimentId, setSelectedExperimentId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const { data: experimentDetail } = useExperimentDetail(selectedExperimentId);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading experiments...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="px-6 py-4 border-b bg-background flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Enrichment Experiments</h1>
          <p className="text-sm text-muted-foreground">
            Compare AI models and prompts for supplier classification
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <ArrowCounterClockwise className="h-4 w-4" />
          Refresh
        </Button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Experiments List */}
        <div className="w-80 border-r overflow-y-auto">
          <div className="p-4 space-y-2">
            {experiments?.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No experiments yet. Run an enrichment to create one.
              </p>
            )}
            {experiments?.map((exp) => (
              <button
                key={exp.id}
                onClick={() => setSelectedExperimentId(exp.id)}
                className={cn(
                  "w-full text-left rounded-lg border p-3 transition-colors",
                  selectedExperimentId === exp.id
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm truncate">{exp.name}</span>
                  {exp.isActive && (
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      Active
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mb-2">
                  {exp.promptVersion}
                </div>
                <div className="flex gap-3 text-xs">
                  <span className="text-muted-foreground">
                    {exp.stats.totalRuns} runs
                  </span>
                  {exp.stats.accuracyRate !== null && (
                    <span
                      className={
                        exp.stats.accuracyRate >= 80
                          ? "text-emerald-600"
                          : exp.stats.accuracyRate >= 60
                          ? "text-amber-600"
                          : "text-red-600"
                      }
                    >
                      {exp.stats.accuracyRate}% accuracy
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Experiment Detail */}
        <div className="flex-1 overflow-y-auto p-6">
          {!selectedExperimentId ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Flask className="h-12 w-12 text-muted-foreground/30 mb-4" weight="duotone" />
              <h3 className="font-medium mb-1">Select an experiment</h3>
              <p className="text-sm text-muted-foreground">
                Choose an experiment from the list to view details and runs
              </p>
            </div>
          ) : experimentDetail ? (
            <div className="space-y-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-5 gap-4">
                <StatCard
                  icon={Flask}
                  label="Total Runs"
                  value={experimentDetail.stats.totalRuns}
                />
                <StatCard
                  icon={Lightning}
                  label="Avg Latency"
                  value={`${experimentDetail.stats.avgLatencyMs}ms`}
                />
                <StatCard
                  icon={CurrencyDollar}
                  label="Total Cost"
                  value={`$${experimentDetail.stats.totalCost.toFixed(4)}`}
                />
                <StatCard
                  icon={CheckCircle}
                  label="Feedback"
                  value={experimentDetail.stats.feedbackCount}
                  subtext={`${experimentDetail.stats.correctCount} correct`}
                />
                <StatCard
                  icon={Clock}
                  label="Accuracy"
                  value={
                    experimentDetail.stats.accuracyRate !== null
                      ? `${experimentDetail.stats.accuracyRate}%`
                      : "—"
                  }
                  color={
                    experimentDetail.stats.accuracyRate === null
                      ? "default"
                      : experimentDetail.stats.accuracyRate >= 80
                      ? "success"
                      : experimentDetail.stats.accuracyRate >= 60
                      ? "warning"
                      : "danger"
                  }
                />
              </div>

              {/* Prompt & Config */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <section>
                  <h3 className="text-sm font-medium mb-2">Prompt Version</h3>
                  <div className="rounded border p-3 bg-muted/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline">{experimentDetail.experiment.promptVersion}</Badge>
                      {experimentDetail.experiment.isActive && (
                        <Badge variant="secondary">Active</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {experimentDetail.experiment.description || "No description"}
                    </p>
                  </div>
                </section>
                <section>
                  <h3 className="text-sm font-medium mb-2">Model Configuration</h3>
                  <div className="rounded border p-3 bg-muted/50 text-xs font-mono">
                    {JSON.stringify(experimentDetail.experiment.modelConfig, null, 2)}
                  </div>
                </section>
              </div>
              
              {/* View full prompt from first run if available */}
              {experimentDetail.recentRuns.length > 0 && (
                <details className="group">
                  <summary className="text-sm font-medium cursor-pointer hover:text-primary">
                    View System Prompt Used{" "}
                    <CaretRight className="inline h-4 w-4 transition-transform group-open:rotate-90" />
                  </summary>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Click "View" on any run to see the exact prompt and response.
                  </div>
                </details>
              )}

              {/* Runs Table */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium">
                    Recent Runs ({experimentDetail.recentRuns.length})
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Note: Each row = 1 candidate result. Candidates are batched 8 per API call.
                  </p>
                </div>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Domain</TableHead>
                        <TableHead>Latency</TableHead>
                        <TableHead>Cost</TableHead>
                        <TableHead>Quick Feedback</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {experimentDetail.recentRuns.map((run) => (
                        <RunTableRow 
                          key={run.id} 
                          run={run} 
                          onViewClick={() => setSelectedRunId(run.id)} 
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-muted-foreground">Loading...</div>
            </div>
          )}
        </div>
      </div>

      {/* Run Detail Modal */}
      <Dialog open={!!selectedRunId} onOpenChange={(open) => !open && setSelectedRunId(null)}>
        {selectedRunId && (
          <RunDetailModal runId={selectedRunId} onClose={() => setSelectedRunId(null)} />
        )}
      </Dialog>
    </div>
  );
}

