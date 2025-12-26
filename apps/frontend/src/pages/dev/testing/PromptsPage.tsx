/**
 * Prompts Page
 * 
 * View and edit AI prompts for status detection testing.
 */

import { useState } from "react";
import { usePrompts, usePrompt, useCreatePrompt, useUpdatePrompt, TestPrompt } from "@/api/useTesting";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Textarea } from "@/ui/textarea";
import { Label } from "@/ui/label";
import { Card } from "@/ui/card";
import { Badge } from "@/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Loader2, Plus, Pencil, Copy } from "lucide-react";

const MODELS = [
  { value: "gpt-4o-mini", label: "GPT-4o Mini (Fast, Cheap)" },
  { value: "gpt-4o", label: "GPT-4o (Best, Expensive)" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
];

export default function PromptsPage() {
  const { data: prompts, isLoading, refetch } = usePrompts();
  const [editingPrompt, setEditingPrompt] = useState<TestPrompt | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [viewPromptId, setViewPromptId] = useState<string | null>(null);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Prompt Versions</h1>
          <p className="text-muted-foreground">
            Manage and compare different AI prompts for status detection
          </p>
        </div>
        <Button onClick={() => setIsCreating(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Prompt
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Runs</TableHead>
                <TableHead>Avg Accuracy</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prompts?.map(prompt => (
                <TableRow key={prompt.id}>
                  <TableCell className="font-mono font-medium">
                    {prompt.version}
                  </TableCell>
                  <TableCell>{prompt.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{prompt.model}</Badge>
                  </TableCell>
                  <TableCell>{prompt.runCount || 0}</TableCell>
                  <TableCell>
                    {prompt.avgAccuracy != null ? (
                      <Badge 
                        variant={prompt.avgAccuracy >= 0.85 ? "default" : "secondary"}
                      >
                        {(prompt.avgAccuracy * 100).toFixed(1)}%
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {prompt.isActive ? (
                      <Badge variant="default">Active</Badge>
                    ) : (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setEditingPrompt(prompt)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setViewPromptId(prompt.id)}
                      >
                        View
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {prompts?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No prompts found. Click "New Prompt" to create one.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <PromptEditorDialog
        prompt={editingPrompt}
        isCreating={isCreating}
        onClose={() => {
          setEditingPrompt(null);
          setIsCreating(false);
        }}
        onSaved={() => {
          setEditingPrompt(null);
          setIsCreating(false);
          refetch();
        }}
        existingPrompts={prompts || []}
      />

      {/* View Prompt Dialog */}
      <ViewPromptDialog
        promptId={viewPromptId}
        onClose={() => setViewPromptId(null)}
      />
    </div>
  );
}

function PromptEditorDialog({
  prompt,
  isCreating,
  onClose,
  onSaved,
  existingPrompts,
}: {
  prompt: TestPrompt | null;
  isCreating: boolean;
  onClose: () => void;
  onSaved: () => void;
  existingPrompts: TestPrompt[];
}) {
  const createMutation = useCreatePrompt();
  const updateMutation = useUpdatePrompt();

  const [version, setVersion] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [maxTokens, setMaxTokens] = useState(500);

  // Initialize form when prompt changes
  useState(() => {
    if (prompt) {
      setVersion(prompt.version);
      setName(prompt.name);
      setDescription(prompt.description || "");
      setSystemPrompt(prompt.systemPrompt);
      setModel(prompt.model);
      setMaxTokens(prompt.maxTokens);
    } else if (isCreating) {
      // Suggest next version
      const versions = existingPrompts.map(p => p.version);
      const versionNumbers = versions
        .map(v => parseInt(v.match(/v(\d+)/)?.[1] || "0"))
        .filter(n => !isNaN(n));
      const nextVersion = Math.max(0, ...versionNumbers) + 1;
      setVersion(`v${nextVersion}`);
      setName("");
      setDescription("");
      setSystemPrompt("");
      setModel("gpt-4o-mini");
      setMaxTokens(500);
    }
  });

  const isOpen = !!prompt || isCreating;

  const handleSave = async () => {
    if (prompt) {
      await updateMutation.mutateAsync({
        id: prompt.id,
        data: { name, description, systemPrompt, model, maxTokens },
      });
    } else {
      await createMutation.mutateAsync({
        version,
        name,
        description,
        systemPrompt,
        model,
        maxTokens,
      });
    }
    onSaved();
  };

  const handleDuplicate = () => {
    if (prompt) {
      const versions = existingPrompts.map(p => p.version);
      const versionNumbers = versions
        .map(v => parseInt(v.match(/v(\d+)/)?.[1] || "0"))
        .filter(n => !isNaN(n));
      const nextVersion = Math.max(0, ...versionNumbers) + 1;
      setVersion(`v${nextVersion}`);
      setName(`${prompt.name} (Copy)`);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {prompt ? `Edit Prompt: ${prompt.version}` : "New Prompt"}
          </DialogTitle>
          <DialogDescription>
            Configure the system prompt and model settings for testing
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="version">Version</Label>
              <Input
                id="version"
                placeholder="v1"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                disabled={!!prompt}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="Default Status Detection"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="Describe what makes this prompt different..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="model">Model</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODELS.map(m => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxTokens">Max Tokens</Label>
              <Input
                id="maxTokens"
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value) || 500)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="systemPrompt">System Prompt</Label>
            <Textarea
              id="systemPrompt"
              placeholder="You are analyzing an email thread..."
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="min-h-[300px] font-mono text-sm"
            />
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          {prompt && (
            <Button variant="outline" onClick={handleDuplicate}>
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!version || !name || !systemPrompt || createMutation.isPending || updateMutation.isPending}
          >
            {(createMutation.isPending || updateMutation.isPending) && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            {prompt ? "Save Changes" : "Create Prompt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewPromptDialog({
  promptId,
  onClose,
}: {
  promptId: string | null;
  onClose: () => void;
}) {
  const { data: prompt, isLoading } = usePrompt(promptId || undefined);

  if (!promptId) return null;

  return (
    <Dialog open={!!promptId} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {prompt?.version || "Loading..."} - {prompt?.name}
          </DialogTitle>
          {prompt?.description && (
            <DialogDescription>{prompt.description}</DialogDescription>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : prompt ? (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Badge variant="outline">{prompt.model}</Badge>
              <Badge variant="secondary">{prompt.maxTokens} max tokens</Badge>
              <Badge variant={prompt.isActive ? "default" : "outline"}>
                {prompt.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>

            <div>
              <Label className="text-sm text-muted-foreground">System Prompt</Label>
              <pre className="mt-2 p-4 bg-muted rounded-md text-sm whitespace-pre-wrap font-mono overflow-x-auto">
                {prompt.systemPrompt}
              </pre>
            </div>

            {prompt.runs && prompt.runs.length > 0 && (
              <div>
                <Label className="text-sm text-muted-foreground">Recent Runs</Label>
                <div className="mt-2 space-y-2">
                  {prompt.runs.map((run: { id: string; accuracy: number; emailSet?: { name: string }; createdAt: string }) => (
                    <div 
                      key={run.id}
                      className="flex items-center justify-between p-2 rounded-md bg-muted"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant={run.accuracy >= 0.85 ? "default" : "secondary"}>
                          {(run.accuracy * 100).toFixed(1)}%
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {run.emailSet?.name}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(run.createdAt).toLocaleDateString()}
                      </span>
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


