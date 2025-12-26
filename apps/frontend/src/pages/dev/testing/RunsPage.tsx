/**
 * Runs Page
 * 
 * List all test runs and their results.
 */

import { Link } from "react-router-dom";
import { useRuns } from "@/api/useTesting";
import { Button } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";
import { Badge } from "@/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/table";
import { Loader2, ArrowRight, CheckCircle, XCircle, Clock } from "lucide-react";

export default function RunsPage() {
  const { data: runs, isLoading } = useRuns();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Test Runs</h1>
          <p className="text-muted-foreground">
            View and compare test execution results
          </p>
        </div>
        <Button asChild>
          <Link to="/dev/testing/run">
            Run New Test
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : runs?.length === 0 ? (
        <Card className="py-12">
          <CardContent className="text-center">
            <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Test Runs</h3>
            <p className="text-muted-foreground mb-4">
              Run your first test to see results here
            </p>
            <Button asChild>
              <Link to="/dev/testing/run">
                Run Test
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Email Set</TableHead>
                <TableHead>Prompt</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Accuracy</TableHead>
                <TableHead>Passed / Failed</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs?.map(run => (
                <TableRow key={run.id}>
                  <TableCell>
                    {run.status === "COMPLETED" ? (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Complete
                      </Badge>
                    ) : run.status === "RUNNING" ? (
                      <Badge variant="secondary" className="gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Running
                      </Badge>
                    ) : run.status === "FAILED" ? (
                      <Badge variant="destructive" className="gap-1">
                        <XCircle className="h-3 w-3" />
                        Failed
                      </Badge>
                    ) : (
                      <Badge variant="outline">{run.status}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    {run.emailSet?.name || "Unknown"}
                  </TableCell>
                  <TableCell className="font-mono">
                    {run.promptVersion}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{run.model}</Badge>
                  </TableCell>
                  <TableCell>
                    {run.status === "COMPLETED" ? (
                      <Badge 
                        variant={run.accuracy >= 0.85 ? "default" : run.accuracy >= 0.7 ? "secondary" : "destructive"}
                      >
                        {(run.accuracy * 100).toFixed(1)}%
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {run.status === "COMPLETED" ? (
                      <span className="text-sm">
                        <span className="text-green-600">{run.passed}</span>
                        {" / "}
                        <span className="text-red-600">{run.failed}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    ${run.estimatedCost.toFixed(3)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(run.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/dev/testing/runs/${run.id}`}>
                        View
                        <ArrowRight className="h-4 w-4 ml-1" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}


