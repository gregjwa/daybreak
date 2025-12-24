import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Badge } from "@/ui/badge";
import { Label } from "@/ui/label";
import { Textarea } from "@/ui/textarea";
import { ArrowRight, Check, CircleNotch, EnvelopeSimple, Inbox, Sparkle } from "@phosphor-icons/react";
import { useActiveBackfill, useStartBackfill } from "@/api/useBackfill";
import { useSupplierCandidates } from "@/api/useSupplierCandidates";

export default function InboxSettingsPage() {
  const navigate = useNavigate();
  const { data: activeBackfill } = useActiveBackfill();
  const { data: candidates } = useSupplierCandidates("NEW");
  const startBackfill = useStartBackfill();
  const [timeframe, setTimeframe] = useState(6);
  const [eventContext, setEventContext] = useState("");

  const hasActiveRun = !!activeBackfill?.activeRun;
  const pendingCandidatesCount = candidates?.length || 0;

  const handleStartImport = async () => {
    try {
      const result = await startBackfill.mutateAsync({ timeframeMonths: timeframe, eventContext });
      navigate(`/inbox/import?runId=${result.runId}`);
    } catch (err) {
      console.error("Failed to start import:", err);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-5 border-b bg-background">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Inbox className="h-5 w-5 text-primary" weight="bold" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
            <p className="text-sm text-muted-foreground">Manage your email connection and imports</p>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Pending Review Card */}
          {pendingCandidatesCount > 0 && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-medium">
                    Suppliers to Review
                  </CardTitle>
                  <Badge variant="secondary" className="text-primary">
                    {pendingCandidatesCount} pending
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  You have discovered suppliers waiting for your review.
                </p>
                <Button onClick={() => navigate("/inbox/import")} className="gap-2">
                  Review Now
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Active Import Card */}
          {hasActiveRun && (
            <Card className="border-amber-500/20 bg-amber-50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <CircleNotch className="h-4 w-4 animate-spin" />
                    Import in Progress
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Found {activeBackfill.activeRun?.createdCandidates || 0} suppliers so far...
                </p>
                <Button onClick={() => navigate(`/inbox/import?runId=${activeBackfill.activeRun?.id}`)} variant="outline">
                  View Progress
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Import from Email Card */}
          {!hasActiveRun && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <EnvelopeSimple className="h-5 w-5" />
                  Import Suppliers from Email
                </CardTitle>
                <CardDescription>
                  Scan your sent emails to automatically discover vendors and contacts you've been working with.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Event Context */}
                <div className="space-y-2">
                  <Label htmlFor="eventContext" className="text-sm font-medium">
                    What type of events do you plan?
                  </Label>
                  <Textarea
                    id="eventContext"
                    placeholder="e.g., Weddings and corporate events in the Bay Area"
                    value={eventContext}
                    onChange={(e) => setEventContext(e.target.value)}
                    className="min-h-[80px] resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    This helps AI identify relevant suppliers from your email contacts
                  </p>
                </div>

                {/* Timeframe */}
                <div className="flex items-center gap-4">
                  <Label className="text-sm">Timeframe:</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={timeframe === 6 ? "default" : "outline"}
                      size="sm"
                      onClick={() => setTimeframe(6)}
                    >
                      6 months
                    </Button>
                    <Button
                      variant={timeframe === 12 ? "default" : "outline"}
                      size="sm"
                      onClick={() => setTimeframe(12)}
                    >
                      12 months
                    </Button>
                  </div>
                </div>

                <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground space-y-2">
                  <div className="flex items-start gap-2">
                    <Check className="h-4 w-4 mt-0.5 text-emerald-500" />
                    <span>Scans all recipients from your sent emails</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="h-4 w-4 mt-0.5 text-emerald-500" />
                    <span>AI identifies relevant suppliers and auto-categorizes them</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="h-4 w-4 mt-0.5 text-emerald-500" />
                    <span>High-confidence matches are imported automatically</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="h-4 w-4 mt-0.5 text-emerald-500" />
                    <span>You can review and correct anything after</span>
                  </div>
                </div>

                <Button
                  onClick={handleStartImport}
                  disabled={startBackfill.isPending}
                  className="w-full gap-2"
                  size="lg"
                >
                  {startBackfill.isPending ? (
                    <>
                      <CircleNotch className="h-4 w-4 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Sparkle className="h-4 w-4" weight="fill" />
                      Start Import
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Info Card */}
          <Card className="bg-muted/30">
            <CardContent className="pt-6">
              <h3 className="font-medium mb-2">How it works</h3>
              <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                <li>We scan all recipients from your sent emails</li>
                <li>AI analyzes each contact based on your event types</li>
                <li>Relevant suppliers are categorized (Florist, Photographer, etc.)</li>
                <li>High-confidence matches are imported automatically</li>
                <li>Lower confidence contacts are shown for your review</li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
