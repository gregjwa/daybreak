/**
 * Email Set Detail Page
 * 
 * Browse test cases within an email set with filtering.
 */

import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useEmailSet, useTestCase, TestCase } from "@/api/useTesting";
import { Button } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";
import { Badge } from "@/ui/badge";
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
  Loader2, 
  ChevronLeft, 
  ChevronRight, 
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  MessageSquare
} from "lucide-react";

export default function EmailSetDetail() {
  const { id } = useParams<{ id: string }>();
  const [page, setPage] = useState(1);
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  const { data, isLoading } = useEmailSet(id, {
    page,
    pageSize: 50,
    direction: directionFilter !== "all" ? directionFilter : undefined,
    difficulty: difficultyFilter !== "all" ? difficultyFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
  });

  // Get unique expected statuses from cases
  const statuses = useMemo(() => {
    if (!data?.cases) return [];
    return [...new Set(data.cases.map(c => c.expectedStatus))].sort();
  }, [data?.cases]);

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
        <p className="text-muted-foreground">Email set not found</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dev/testing/email-sets">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{data.emailSet.name}</h1>
          <p className="text-muted-foreground">
            {data.pagination.total} test cases
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-4 flex-wrap">
            <Select value={directionFilter} onValueChange={setDirectionFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Direction" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Directions</SelectItem>
                <SelectItem value="INBOUND">Inbound</SelectItem>
                <SelectItem value="OUTBOUND">Outbound</SelectItem>
              </SelectContent>
            </Select>

            <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Difficulty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Difficulties</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="tricky">Tricky</SelectItem>
                <SelectItem value="followup">Follow-up</SelectItem>
                <SelectItem value="edge">Edge Case</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Expected Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {statuses.map(status => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]">Dir</TableHead>
              <TableHead>Persona</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Expected</TableHead>
              <TableHead>Scenario</TableHead>
              <TableHead className="w-[60px]">Thread</TableHead>
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.cases.map(testCase => (
              <TableRow 
                key={testCase.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => setSelectedCaseId(testCase.id)}
              >
                <TableCell>
                  {testCase.direction === "INBOUND" ? (
                    <Badge variant="outline" className="gap-1">
                      <ArrowDown className="h-3 w-3" />
                      IN
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <ArrowUp className="h-3 w-3" />
                      OUT
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="font-medium">
                  {testCase.persona?.name || "Unknown"}
                </TableCell>
                <TableCell className="max-w-[300px] truncate">
                  {testCase.subject}
                </TableCell>
                <TableCell>
                  <Badge>{testCase.expectedStatus}</Badge>
                </TableCell>
                <TableCell>
                  <Badge 
                    variant={
                      testCase.scenario === "edge" ? "destructive" :
                      testCase.scenario === "tricky" ? "outline" :
                      "secondary"
                    }
                  >
                    {testCase.scenario}
                  </Badge>
                </TableCell>
                <TableCell>
                  {testCase.hasThreadContext && (
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  )}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm">
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {(page - 1) * 50 + 1} - {Math.min(page * 50, data.pagination.total)} of {data.pagination.total}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => p + 1)}
            disabled={page >= data.pagination.totalPages}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Test Case Detail Modal */}
      <TestCaseDetailModal
        caseId={selectedCaseId}
        onClose={() => setSelectedCaseId(null)}
      />
    </div>
  );
}

function TestCaseDetailModal({
  caseId,
  onClose,
}: {
  caseId: string | null;
  onClose: () => void;
}) {
  const { data: testCase, isLoading } = useTestCase(caseId || undefined);

  if (!caseId) return null;

  return (
    <Dialog open={!!caseId} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Test Case Details</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : testCase ? (
          <div className="space-y-6">
            {/* Meta Info */}
            <div className="flex gap-4 flex-wrap">
              <Badge variant={testCase.direction === "INBOUND" ? "outline" : "secondary"}>
                {testCase.direction}
              </Badge>
              <Badge>{testCase.expectedStatus}</Badge>
              <Badge 
                variant={testCase.scenario === "edge" ? "destructive" : "outline"}
              >
                {testCase.scenario} (difficulty {testCase.difficulty})
              </Badge>
              {testCase.tags?.map((tag: string) => (
                <Badge key={tag} variant="outline">{tag}</Badge>
              ))}
            </div>

            {/* Persona */}
            {testCase.persona && (
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Persona</label>
                <p className="font-medium">{testCase.persona.name} ({testCase.persona.category})</p>
              </div>
            )}

            {/* Thread Visualization */}
            <div>
              <label className="text-sm text-muted-foreground block mb-2">
                Email Thread 
                {testCase.hasThreadContext && ` (${((testCase.threadContext as unknown[])?.length || 0) + 1} messages)`}
              </label>
              <div className="space-y-2 border-l-2 border-muted pl-4">
                {/* Previous messages in thread */}
                {testCase.hasThreadContext && testCase.threadContext && (
                  (testCase.threadContext as { direction: string; subject: string; body: string }[]).map((msg, i) => (
                    <div key={i} className="relative">
                      <div className="absolute -left-[21px] top-2 w-3 h-3 rounded-full bg-muted border-2 border-background" />
                      <Card className={msg.direction === "OUTBOUND" ? "bg-blue-50 dark:bg-blue-950/20 border-blue-200" : "bg-muted"}>
                        <CardContent className="p-3">
                          <div className="flex items-center gap-2 mb-1">
                            {msg.direction === "OUTBOUND" ? (
                              <ArrowUp className="h-3 w-3 text-blue-600" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-green-600" />
                            )}
                            <span className="text-xs font-medium">
                              {msg.direction === "OUTBOUND" ? "You → Vendor" : "Vendor → You"}
                            </span>
                          </div>
                          <p className="font-medium text-sm">{msg.subject}</p>
                          <p className="text-sm text-muted-foreground mt-1">{msg.body}</p>
                        </CardContent>
                      </Card>
                    </div>
                  ))
                )}

                {/* NEW/LATEST Email - The one being tested */}
                <div className="relative">
                  <div className="absolute -left-[21px] top-2 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                  <Card className={`border-2 ${
                    testCase.direction === "OUTBOUND" 
                      ? "bg-blue-100 dark:bg-blue-900/30 border-blue-400" 
                      : "bg-green-100 dark:bg-green-900/30 border-green-400"
                  }`}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        {testCase.direction === "OUTBOUND" ? (
                          <ArrowUp className="h-4 w-4 text-blue-600" />
                        ) : (
                          <ArrowDown className="h-4 w-4 text-green-600" />
                        )}
                        <span className="text-xs font-bold uppercase tracking-wide">
                          {testCase.direction === "OUTBOUND" ? "You → Vendor" : "Vendor → You"}
                        </span>
                        <Badge variant="default" className="text-xs">NEW - LATEST</Badge>
                      </div>
                      <p className="font-semibold mb-2">Subject: {testCase.subject}</p>
                      <p className="text-sm whitespace-pre-wrap">{testCase.body}</p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>

            {/* Ground Truth */}
            <div>
              <label className="text-sm text-muted-foreground block mb-2">Ground Truth</label>
              <div className="flex items-center gap-2">
                <Badge variant="default" className="text-base px-3 py-1">
                  {testCase.expectedStatus}
                </Badge>
              </div>
              {testCase.generationNotes && (
                <p className="text-sm text-muted-foreground mt-2">{testCase.generationNotes}</p>
              )}
            </div>

            {/* Test Results History */}
            {testCase.results && testCase.results.length > 0 && (
              <div>
                <label className="text-sm text-muted-foreground block mb-2">Test Results History</label>
                <div className="space-y-2">
                  {testCase.results.slice(0, 5).map((result: { id: string; passed: boolean; detectedStatus: string | null; confidence: number | null; run?: { promptVersion: string; model: string; createdAt: string } }) => (
                    <div 
                      key={result.id}
                      className="flex items-center justify-between p-2 rounded-md bg-muted"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant={result.passed ? "default" : "destructive"}>
                          {result.passed ? "PASS" : "FAIL"}
                        </Badge>
                        <span className="text-sm">
                          Detected: {result.detectedStatus || "null"} 
                          {result.confidence != null && ` (${(result.confidence * 100).toFixed(0)}%)`}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {result.run?.promptVersion} / {result.run?.model}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}


