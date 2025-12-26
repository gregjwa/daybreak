/**
 * Testing Overview Page
 * 
 * Dashboard overview for the status detection testing system.
 */

import { Link } from "react-router-dom";
import { useRuns, useEmailSets, usePrompts, usePersonas } from "@/api/useTesting";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Button } from "@/ui/button";
import { Badge } from "@/ui/badge";
import { 
  Users, 
  EnvelopeSimple, 
  Terminal, 
  Play, 
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Minus
} from "lucide-react";

export default function TestingOverview() {
  const { data: personas } = usePersonas();
  const { data: emailSets } = useEmailSets();
  const { data: prompts } = usePrompts();
  const { data: runs } = useRuns();

  const completedRuns = runs?.filter(r => r.status === "COMPLETED") || [];
  const latestRun = completedRuns[0];
  const previousRun = completedRuns[1];

  // Calculate accuracy trend
  const accuracyTrend = latestRun && previousRun 
    ? latestRun.accuracy - previousRun.accuracy 
    : null;

  const totalEmails = emailSets?.reduce((sum, s) => sum + s.totalCases, 0) || 0;
  const activePrompts = prompts?.filter(p => p.isActive).length || 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Status Detection Testing</h1>
        <p className="text-muted-foreground">
          A/B test prompts and models for optimal status detection accuracy
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" />
              <span className="text-sm">Personas</span>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{personas?.length || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <EnvelopeSimple className="h-4 w-4" />
              <span className="text-sm">Test Emails</span>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalEmails}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Terminal className="h-4 w-4" />
              <span className="text-sm">Active Prompts</span>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{activePrompts}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Play className="h-4 w-4" />
              <span className="text-sm">Test Runs</span>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{completedRuns.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Latest Results */}
      {latestRun ? (
        <Card>
          <CardHeader>
            <CardTitle>Latest Test Run</CardTitle>
            <CardDescription>
              {latestRun.promptVersion} on {latestRun.emailSet?.name}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-8">
              <div className="text-center">
                <p className="text-4xl font-bold">
                  {(latestRun.accuracy * 100).toFixed(1)}%
                </p>
                <p className="text-sm text-muted-foreground">Accuracy</p>
              </div>
              
              {accuracyTrend !== null && (
                <div className="text-center">
                  <div className={`flex items-center gap-1 text-2xl font-bold ${
                    accuracyTrend > 0 ? "text-green-600" :
                    accuracyTrend < 0 ? "text-red-600" : 
                    "text-muted-foreground"
                  }`}>
                    {accuracyTrend > 0 ? <TrendingUp className="h-6 w-6" /> :
                     accuracyTrend < 0 ? <TrendingDown className="h-6 w-6" /> :
                     <Minus className="h-6 w-6" />}
                    {accuracyTrend > 0 ? "+" : ""}{(accuracyTrend * 100).toFixed(1)}%
                  </div>
                  <p className="text-sm text-muted-foreground">vs Previous</p>
                </div>
              )}

              <div className="flex-1" />

              <div className="text-right">
                <div className="flex gap-4 text-sm">
                  <div>
                    <span className="text-green-600 font-bold">{latestRun.passed}</span>
                    <span className="text-muted-foreground"> passed</span>
                  </div>
                  <div>
                    <span className="text-red-600 font-bold">{latestRun.failed}</span>
                    <span className="text-muted-foreground"> failed</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(latestRun.createdAt).toLocaleString()}
                </p>
              </div>

              <Button asChild>
                <Link to={`/dev/testing/runs/${latestRun.id}`}>
                  View Details
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="py-8">
          <CardContent className="text-center">
            <Play className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Test Runs Yet</h3>
            <p className="text-muted-foreground mb-4">
              Run your first test to start measuring accuracy
            </p>
            <Button asChild>
              <Link to="/dev/testing/run">
                Run First Test
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Personas
            </CardTitle>
            <CardDescription>
              Vendor personas for test email generation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Badge variant="outline">{personas?.length || 0} personas</Badge>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/dev/testing/personas">
                  Manage
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <EnvelopeSimple className="h-5 w-5" />
              Email Sets
            </CardTitle>
            <CardDescription>
              Versioned collections of test emails
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Badge variant="outline">{emailSets?.length || 0} sets</Badge>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/dev/testing/email-sets">
                  Manage
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              Prompts
            </CardTitle>
            <CardDescription>
              AI prompts for A/B testing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Badge variant="outline">{prompts?.length || 0} versions</Badge>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/dev/testing/prompts">
                  Manage
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


