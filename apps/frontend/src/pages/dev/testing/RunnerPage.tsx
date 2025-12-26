/**
 * Runner Page
 * 
 * Configure and start new test runs.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useEmailSets, usePrompts, useStartRun } from "@/api/useTesting";
import { Button } from "@/ui/button";
import { Label } from "@/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import { Loader2, Play, AlertTriangle, DollarSign, Clock, Zap } from "lucide-react";

const MODELS = [
  { value: "gpt-5-mini", label: "GPT-5 Mini (Recommended)", costPer1k: 0.0003 },
  { value: "gpt-5", label: "GPT-5", costPer1k: 0.003 },
  { value: "gpt-5-nano", label: "GPT-5 Nano", costPer1k: 0.0001 },
  { value: "gpt-5-pro", label: "GPT-5 Pro", costPer1k: 0.006 },
  { value: "gpt-5.1", label: "GPT-5.1", costPer1k: 0.003 },
  { value: "gpt-5.2", label: "GPT-5.2", costPer1k: 0.003 },
  { value: "gpt-5.2-pro", label: "GPT-5.2 Pro", costPer1k: 0.006 },
  { value: "gpt-4.1", label: "GPT-4.1", costPer1k: 0.006 },
  { value: "gpt-4.1-mini", label: "GPT-4.1 Mini", costPer1k: 0.0006 },
  { value: "gpt-4.1-nano", label: "GPT-4.1 Nano", costPer1k: 0.0003 },
  { value: "gpt-4o", label: "GPT-4o", costPer1k: 0.005 },
  { value: "gpt-4o-mini", label: "GPT-4o Mini", costPer1k: 0.0003 },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo", costPer1k: 0.01 },
  { value: "gpt-4", label: "GPT-4", costPer1k: 0.03 },
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo", costPer1k: 0.0005 },
];

export default function RunnerPage() {
  const navigate = useNavigate();
  const { data: emailSets, isLoading: loadingEmailSets } = useEmailSets();
  const { data: prompts, isLoading: loadingPrompts } = usePrompts();
  const startMutation = useStartRun();

  const [emailSetId, setEmailSetId] = useState<string>("");
  const [promptId, setPromptId] = useState<string>("");
  const [modelOverride, setModelOverride] = useState<string>("");

  const isLoading = loadingEmailSets || loadingPrompts;

  // Get selected items for estimates
  const selectedEmailSet = emailSets?.find(s => s.id === emailSetId);
  const selectedPrompt = prompts?.find(p => p.id === promptId);
  const selectedModel = modelOverride || selectedPrompt?.model || "gpt-4o-mini";
  const modelInfo = MODELS.find(m => m.value === selectedModel);

  // Estimates
  const caseCount = selectedEmailSet?.totalCases || 0;
  const estimatedCost = caseCount * (modelInfo?.costPer1k || 0.0003) * 0.5; // ~500 tokens avg
  const estimatedTimeMinutes = Math.ceil(caseCount * 1.5 / 60); // ~1.5 sec per call

  const handleStartRun = async () => {
    if (!emailSetId || !promptId) return;

    const result = await startMutation.mutateAsync({
      emailSetId,
      promptId,
      modelOverride: modelOverride || undefined,
    });

    // Navigate to the run detail page
    navigate(`/dev/testing/runs/${result.runId}`);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Run New Test</h1>
        <p className="text-muted-foreground">
          Execute status detection tests against your email set
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Test Configuration</CardTitle>
              <CardDescription>
                Select an email set and prompt version to test
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Email Set */}
              <div className="space-y-2">
                <Label htmlFor="emailSet">Email Set</Label>
                <Select value={emailSetId} onValueChange={setEmailSetId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an email set" />
                  </SelectTrigger>
                  <SelectContent>
                    {emailSets?.filter(s => s.totalCases > 0).map(set => (
                      <SelectItem key={set.id} value={set.id}>
                        {set.name} ({set.totalCases} emails)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {emailSets?.filter(s => s.totalCases > 0).length === 0 && (
                  <p className="text-sm text-destructive">
                    No email sets with generated emails. Create one first.
                  </p>
                )}
              </div>

              {/* Prompt */}
              <div className="space-y-2">
                <Label htmlFor="prompt">Prompt Version</Label>
                <Select value={promptId} onValueChange={setPromptId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a prompt version" />
                  </SelectTrigger>
                  <SelectContent>
                    {prompts?.filter(p => p.isActive).map(prompt => (
                      <SelectItem key={prompt.id} value={prompt.id}>
                        {prompt.version} - {prompt.name}
                        {prompt.avgAccuracy != null && (
                          <span className="text-muted-foreground ml-2">
                            ({(prompt.avgAccuracy * 100).toFixed(0)}% avg)
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Model Override */}
              <div className="space-y-2">
                <Label htmlFor="model">Model Override (Optional)</Label>
                <Select value={modelOverride} onValueChange={setModelOverride}>
                  <SelectTrigger>
                    <SelectValue placeholder={`Use prompt default (${selectedPrompt?.model || "gpt-5-mini"})`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Use prompt default</SelectItem>
                    {MODELS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Select a model to override the prompt's default, or leave as default.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Estimates */}
          {emailSetId && promptId && (
            <Card>
              <CardHeader>
                <CardTitle>Estimated Resources</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-full">
                      <Zap className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{caseCount}</p>
                      <p className="text-sm text-muted-foreground">API Calls</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-full">
                      <Clock className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">~{estimatedTimeMinutes} min</p>
                      <p className="text-sm text-muted-foreground">Runtime</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-full">
                      <DollarSign className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">${estimatedCost.toFixed(2)}</p>
                      <p className="text-sm text-muted-foreground">Est. Cost</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Warning */}
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Long Running Operation</AlertTitle>
            <AlertDescription>
              This test will make {caseCount} API calls and may take several minutes.
              You can navigate away and check results later.
            </AlertDescription>
          </Alert>

          {/* Start Button */}
          <Button
            size="lg"
            className="w-full"
            onClick={handleStartRun}
            disabled={!emailSetId || !promptId || startMutation.isPending}
          >
            {startMutation.isPending ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Starting Test...
              </>
            ) : (
              <>
                <Play className="h-5 w-5 mr-2" />
                Run Test
              </>
            )}
          </Button>
        </>
      )}
    </div>
  );
}


