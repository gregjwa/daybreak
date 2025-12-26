/**
 * Run Detail Page
 * 
 * Detailed view of a test run with breakdowns and failure analysis.
 */

import { useState, useMemo, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useRun, TestResult, usePauseRun, useResumeRun, useCancelRun } from "@/api/useTesting";
import { getApiBaseUrl } from "@/lib/apiBase";
import { Button } from "@/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Badge } from "@/ui/badge";
import { Progress } from "@/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/ui/collapsible";
import {
  Loader2,
  ArrowLeft,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  ArrowDown,
  ArrowUp,
  Eye,
  Download,
  Pause,
  Play,
  Square
} from "lucide-react";

export default function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, refetch } = useRun(id);
  const pauseMutation = usePauseRun();
  const resumeMutation = useResumeRun();
  const cancelMutation = useCancelRun();

  const [filter, setFilter] = useState<"all" | "passed" | "failed">("all");
  const [selectedResult, setSelectedResult] = useState<TestResult | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  // Polling for running tests - refetch every 3 seconds while running
  const isRunning = data?.run.status === "RUNNING";
  
  useEffect(() => {
    if (isRunning) {
      const interval = setInterval(() => refetch(), 3000);
      return () => clearInterval(interval);
    }
  }, [isRunning, refetch]);

  // Filter results
  const filteredResults = useMemo(() => {
    if (!data?.run.results) return [];
    switch (filter) {
      case "passed":
        return data.run.results.filter(r => r.passed);
      case "failed":
        return data.run.results.filter(r => !r.passed);
      default:
        return data.run.results;
    }
  }, [data?.run.results, filter]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Run not found</p>
      </div>
    );
  }

  const { run, breakdowns } = data;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dev/testing/runs">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{run.promptVersion}</h1>
            <Badge variant="outline">{run.model}</Badge>
            {run.status === "RUNNING" && (
              <Badge variant="secondary" className="gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Running
              </Badge>
            )}
            {run.status === "PAUSED" && (
              <Badge variant="outline" className="gap-1 border-yellow-500 text-yellow-600">
                <Pause className="h-3 w-3" />
                Paused
              </Badge>
            )}
            {run.status === "CANCELLED" && (
              <Badge variant="outline" className="gap-1 border-red-500 text-red-600">
                <Square className="h-3 w-3" />
                Cancelled
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            {run.emailSet?.name} • {new Date(run.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          {/* Pause/Resume/Cancel buttons */}
          {run.status === "RUNNING" && (
            <>
              <Button
                variant="outline"
                onClick={() => id && pauseMutation.mutate(id)}
                disabled={pauseMutation.isPending}
              >
                {pauseMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Pause className="h-4 w-4 mr-2" />
                )}
                Pause
              </Button>
              <Button
                variant="outline"
                onClick={() => id && cancelMutation.mutate(id)}
                disabled={cancelMutation.isPending}
                className="text-destructive hover:text-destructive"
              >
                {cancelMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Square className="h-4 w-4 mr-2" />
                )}
                Cancel
              </Button>
            </>
          )}
          {run.status === "PAUSED" && (
            <>
              <Button
                variant="outline"
                onClick={() => id && resumeMutation.mutate(id)}
                disabled={resumeMutation.isPending}
              >
                {resumeMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Resume
              </Button>
              <Button
                variant="outline"
                onClick={() => id && cancelMutation.mutate(id)}
                disabled={cancelMutation.isPending}
                className="text-destructive hover:text-destructive"
              >
                {cancelMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Square className="h-4 w-4 mr-2" />
                )}
                Cancel
              </Button>
            </>
          )}
          <Button
            variant="outline"
            onClick={() => {
              window.open(`${getApiBaseUrl()}/testing/runs/${id}/export`, "_blank");
            }}
            disabled={run.status === "RUNNING" || run.status === "PAUSED"}
            title={run.status === "RUNNING" || run.status === "PAUSED" ? "Wait for run to complete" : "Export for Claude Code review"}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button variant="outline" onClick={() => setShowPrompt(true)}>
            <Eye className="h-4 w-4 mr-2" />
            View Prompt
          </Button>
        </div>
      </div>

      {/* Live Progress Bar (when running) */}
      {run.status === "RUNNING" && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="font-medium">Test in progress...</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {run.passed + run.failed} / {run.totalCases} completed
              </span>
            </div>
            <Progress 
              value={run.totalCases > 0 ? ((run.passed + run.failed) / run.totalCases) * 100 : 0} 
              className="h-3"
            />
            <div className="flex justify-between mt-2 text-sm">
              <span className="text-green-600">{run.passed} passed</span>
              <span className="text-red-600">{run.failed} failed</span>
              <span className="text-muted-foreground">
                {run.totalCases - run.passed - run.failed} remaining
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-4xl font-bold">
                {(run.accuracy * 100).toFixed(1)}%
              </p>
              <p className="text-sm text-muted-foreground mt-1">Accuracy</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-4xl font-bold text-green-600">{run.passed}</p>
              <p className="text-sm text-muted-foreground mt-1">Passed</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-4xl font-bold text-red-600">{run.failed}</p>
              <p className="text-sm text-muted-foreground mt-1">Failed</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-4xl font-bold">${run.estimatedCost.toFixed(2)}</p>
              <p className="text-sm text-muted-foreground mt-1">Cost</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Breakdowns */}
      <Tabs defaultValue="scenario">
        <TabsList>
          <TabsTrigger value="scenario">By Scenario</TabsTrigger>
          <TabsTrigger value="status">By Status</TabsTrigger>
        </TabsList>
        
        <TabsContent value="scenario" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Accuracy by Scenario</CardTitle>
              <CardDescription>How well the AI performed on different difficulty levels</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(breakdowns.byScenario).map(([scenario, stats]) => {
                  const accuracy = stats.total > 0 ? stats.passed / stats.total : 0;
                  return (
                    <div key={scenario} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="capitalize font-medium">{scenario}</span>
                        <span>
                          {stats.passed}/{stats.total} ({(accuracy * 100).toFixed(0)}%)
                        </span>
                      </div>
                      <Progress 
                        value={accuracy * 100} 
                        className={accuracy >= 0.85 ? "" : accuracy >= 0.7 ? "bg-yellow-100" : "bg-red-100"}
                      />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="status" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Accuracy by Expected Status</CardTitle>
              <CardDescription>How well the AI detected each status type</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Object.entries(breakdowns.byStatus).map(([status, stats]) => {
                  const accuracy = stats.total > 0 ? stats.passed / stats.total : 0;
                  return (
                    <div key={status} className="p-3 rounded-md border">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline">{status}</Badge>
                        <span className={`text-sm font-medium ${
                          accuracy >= 0.85 ? "text-green-600" : 
                          accuracy >= 0.7 ? "text-yellow-600" : 
                          "text-red-600"
                        }`}>
                          {(accuracy * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {stats.passed}/{stats.total} correct
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Results Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Test Results</CardTitle>
              <CardDescription>Individual test case results</CardDescription>
            </div>
            <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ({run.totalCases})</SelectItem>
                <SelectItem value="passed">Passed ({run.passed})</SelectItem>
                <SelectItem value="failed">Failed ({run.failed})</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">Status</TableHead>
                <TableHead className="w-[60px]">Dir</TableHead>
                <TableHead>Persona</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Detected</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredResults.slice(0, 100).map(result => (
                <TableRow 
                  key={result.id}
                  className={`cursor-pointer ${!result.passed ? "bg-red-50 dark:bg-red-950/20" : ""}`}
                  onClick={() => setSelectedResult(result)}
                >
                  <TableCell>
                    {result.passed ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                  </TableCell>
                  <TableCell>
                    {result.case?.direction === "INBOUND" ? (
                      <ArrowDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ArrowUp className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    {result.case?.persona?.name || "Unknown"}
                  </TableCell>
                  <TableCell>
                    <Badge>{result.expectedStatus}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={result.passed ? "default" : "destructive"}>
                      {result.detectedStatus || "null"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {result.confidence != null ? (
                      <span className={result.confidence >= 0.8 ? "text-green-600" : "text-yellow-600"}>
                        {(result.confidence * 100).toFixed(0)}%
                      </span>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm">
                      Analyze
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filteredResults.length > 100 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Showing first 100 of {filteredResults.length} results
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Failure Detail Modal */}
      <FailureDetailModal
        result={selectedResult}
        promptSnapshot={run.promptSnapshot}
        onClose={() => setSelectedResult(null)}
      />

      {/* Prompt Modal */}
      <Dialog open={showPrompt} onOpenChange={setShowPrompt}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Prompt Used: {run.promptVersion}</DialogTitle>
          </DialogHeader>
          <pre className="p-4 bg-muted rounded-md text-sm whitespace-pre-wrap font-mono overflow-x-auto">
            {run.promptSnapshot}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FailureDetailModal({
  result,
  promptSnapshot,
  onClose,
}: {
  result: TestResult | null;
  promptSnapshot: string;
  onClose: () => void;
}) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [showRawResponse, setShowRawResponse] = useState(false);

  if (!result) return null;

  const testCase = result.case;

  return (
    <Dialog open={!!result} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {result.passed ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <XCircle className="h-5 w-5 text-red-600" />
            )}
            {result.passed ? "Test Passed" : "Failure Analysis"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Persona & Meta */}
          {testCase && (
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline">
                {testCase.persona?.name} ({testCase.persona?.category})
              </Badge>
              <Badge variant={testCase.direction === "INBOUND" ? "secondary" : "outline"}>
                {testCase.direction}
              </Badge>
              <Badge variant="outline">{testCase.scenario}</Badge>
            </div>
          )}

          {/* Thread Context */}
          {testCase?.hasThreadContext && testCase.threadContext && (
            <div>
              <label className="text-sm text-muted-foreground block mb-2">Thread Context</label>
              <div className="space-y-2">
                {(testCase.threadContext as { direction: string; subject: string; body: string }[]).map((msg, i) => (
                  <Card key={i} className={msg.direction === "OUTBOUND" ? "bg-primary/5" : "bg-muted"}>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 mb-1">
                        {msg.direction === "OUTBOUND" ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )}
                        <span className="text-xs text-muted-foreground">{msg.direction}</span>
                      </div>
                      <p className="font-medium text-sm">{msg.subject}</p>
                      <p className="text-sm text-muted-foreground mt-1">{msg.body}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Test Email */}
          {testCase && (
            <div>
              <label className="text-sm text-muted-foreground block mb-2">
                Test Email {testCase.direction === "INBOUND" ? "(From Vendor)" : "(From Planner)"}
              </label>
              <Card>
                <CardContent className="p-4">
                  <p className="font-medium mb-2">Subject: {testCase.subject}</p>
                  <p className="text-sm whitespace-pre-wrap">{testCase.body}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Result Comparison */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="bg-green-50 dark:bg-green-950/20 border-green-200">
              <CardContent className="p-4 text-center">
                <label className="text-sm text-muted-foreground">Expected</label>
                <p className="text-xl font-bold mt-1">{result.expectedStatus}</p>
              </CardContent>
            </Card>
            <Card className={result.passed 
              ? "bg-green-50 dark:bg-green-950/20 border-green-200"
              : "bg-red-50 dark:bg-red-950/20 border-red-200"
            }>
              <CardContent className="p-4 text-center">
                <label className="text-sm text-muted-foreground">Detected</label>
                <p className="text-xl font-bold mt-1">
                  {result.detectedStatus || "null"}
                  {result.confidence != null && (
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      ({(result.confidence * 100).toFixed(0)}%)
                    </span>
                  )}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* AI Reasoning */}
          {result.reasoning && (
            <div>
              <label className="text-sm text-muted-foreground block mb-2">AI Reasoning</label>
              <Card className="bg-muted">
                <CardContent className="p-4">
                  <p className="text-sm italic">"{result.reasoning}"</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Expandable Sections */}
          <div className="space-y-2">
            <Collapsible open={showPrompt} onOpenChange={setShowPrompt}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  Prompt Used
                  {showPrompt ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="mt-2 p-4 bg-muted rounded-md text-xs whitespace-pre-wrap font-mono max-h-[300px] overflow-y-auto">
                  {promptSnapshot}
                </pre>
              </CollapsibleContent>
            </Collapsible>

            <Collapsible open={showRawResponse} onOpenChange={setShowRawResponse}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  Raw AI Response
                  {showRawResponse ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="mt-2 p-4 bg-muted rounded-md text-xs whitespace-pre-wrap font-mono max-h-[300px] overflow-y-auto">
                  {result.rawResponse || "No response captured"}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


