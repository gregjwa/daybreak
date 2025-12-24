import { useState } from "react";
import { 
  useProposals, 
  useThreadsNeedingLink, 
  useResolveProposal,
  useLinkThreadToProject,
  useDismissThread,
  type StatusProposal,
  type ThreadNeedingLink,
} from "@/api/useProposals";
import { useProjects } from "@/api/useProjects";
import { getStatusName, getStatusColor } from "@/api/useStatuses";
import { Button } from "@/ui/button";
import { Badge } from "@/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import { CheckCircle, XCircle, ArrowRight, EnvelopeSimple, Lightning } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

function StatusBadge({ slug }: { slug: string }) {
  const color = getStatusColor(slug);
  return (
    <Badge 
      variant="outline" 
      style={{ borderColor: color, color }}
    >
      {getStatusName(slug)}
    </Badge>
  );
}

function ProposalCard({ 
  proposal, 
  onAccept, 
  onReject,
  isPending,
}: { 
  proposal: StatusProposal; 
  onAccept: () => void;
  onReject: () => void;
  isPending: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{proposal.supplier.name}</CardTitle>
            <CardDescription>{proposal.project.name}</CardDescription>
          </div>
          <Badge variant="secondary" className="ml-2">
            {Math.round(proposal.confidence * 100)}% confident
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status Change */}
        <div className="flex items-center gap-2">
          {proposal.fromStatus && <StatusBadge slug={proposal.fromStatus} />}
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <StatusBadge slug={proposal.toStatus} />
        </div>

        {/* Signals */}
        {proposal.matchedSignals.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {proposal.matchedSignals.map((signal, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                "{signal}"
              </Badge>
            ))}
          </div>
        )}

        {/* Reasoning */}
        {proposal.reasoning && (
          <p className="text-sm text-muted-foreground">{proposal.reasoning}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            size="sm"
            onClick={onAccept}
            disabled={isPending}
            className="gap-1"
          >
            <CheckCircle className="h-4 w-4" />
            Accept
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onReject}
            disabled={isPending}
            className="gap-1"
          >
            <XCircle className="h-4 w-4" />
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ThreadLinkCard({
  thread,
  onLink,
  onDismiss,
}: {
  thread: ThreadNeedingLink;
  onLink: (projectId: string) => void;
  onDismiss: () => void;
}) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const { data: projectsData } = useProjects();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <EnvelopeSimple className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">
                {thread.subject || "No subject"}
              </CardTitle>
              <CardDescription>Which project is this about?</CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Top candidates */}
        {thread.candidates.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Suggested projects:</p>
            {thread.candidates.slice(0, 3).map((candidate) => (
              <button
                key={candidate.id}
                onClick={() => setSelectedProjectId(candidate.id)}
                className={cn(
                  "w-full text-left p-3 rounded-lg border transition-colors",
                  selectedProjectId === candidate.id
                    ? "border-primary bg-primary/5"
                    : "hover:border-primary/50"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{candidate.name}</span>
                  <Badge variant="secondary">
                    {Math.round(candidate.score * 100)}% match
                  </Badge>
                </div>
                {candidate.matchReasons.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {candidate.matchReasons.join(", ")}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Or select from all projects */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Or choose a project:</p>
          <Select
            value={selectedProjectId || ""}
            onValueChange={setSelectedProjectId}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a project..." />
            </SelectTrigger>
            <SelectContent>
              {projectsData?.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            size="sm"
            onClick={() => selectedProjectId && onLink(selectedProjectId)}
            disabled={!selectedProjectId}
          >
            Link to Project
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onDismiss}
          >
            Not Project Related
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PendingActionsPage() {
  const { data: proposalsData, isLoading: proposalsLoading } = useProposals();
  const { data: threadsData, isLoading: threadsLoading } = useThreadsNeedingLink();
  
  const resolveProposal = useResolveProposal();
  const linkThread = useLinkThreadToProject();
  const dismissThread = useDismissThread();

  const proposals = proposalsData?.proposals || [];
  const threads = threadsData?.threads || [];

  const isLoading = proposalsLoading || threadsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const hasItems = proposals.length > 0 || threads.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pending Actions</h1>
        <p className="text-muted-foreground">
          Review suggested status changes and email thread assignments
        </p>
      </div>

      {!hasItems ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle className="h-12 w-12 text-emerald-500 mb-4" />
            <p className="text-lg font-medium">All caught up!</p>
            <p className="text-muted-foreground">No pending actions to review.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Status Proposals */}
          {proposals.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Lightning className="h-5 w-5 text-primary" weight="duotone" />
                <h2 className="text-lg font-semibold">Status Changes ({proposals.length})</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {proposals.map((proposal) => (
                  <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    onAccept={() => resolveProposal.mutate({ 
                      proposalId: proposal.id, 
                      action: "accept" 
                    })}
                    onReject={() => resolveProposal.mutate({ 
                      proposalId: proposal.id, 
                      action: "reject" 
                    })}
                    isPending={resolveProposal.isPending}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Threads Needing Link */}
          {threads.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <EnvelopeSimple className="h-5 w-5 text-primary" weight="duotone" />
                <h2 className="text-lg font-semibold">Emails Needing Project ({threads.length})</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {threads.map((thread) => (
                  <ThreadLinkCard
                    key={thread.threadId}
                    thread={thread}
                    onLink={(projectId) => linkThread.mutate({ 
                      threadId: thread.threadId, 
                      projectId 
                    })}
                    onDismiss={() => dismissThread.mutate(thread.threadId)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

