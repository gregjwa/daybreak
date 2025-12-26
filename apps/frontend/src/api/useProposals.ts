import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { getApiBaseUrl } from "@/lib/apiBase";

const API_URL = getApiBaseUrl();

export interface StatusProposal {
  id: string;
  project: {
    id: string;
    name: string;
    date: string | null;
  };
  supplier: {
    id: string;
    name: string;
  };
  fromStatus: string | null;
  toStatus: string;
  confidence: number;
  matchedSignals: string[];
  reasoning: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface ProjectCandidate {
  id: string;
  name: string;
  date: string | null;
  venue: string | null;
  type: string;
  score: number;
  matchReasons: string[];
}

export interface ThreadNeedingLink {
  threadId: string;
  subject: string | null;
  candidates: ProjectCandidate[];
}

export interface ProposalCounts {
  statusProposals: number;
  ambiguousThreads: number;
  total: number;
}

// Hook to fetch pending proposals
export function useProposals() {
  const { getToken } = useAuth();
  
  return useQuery<{ proposals: StatusProposal[] }>({
    queryKey: ["proposals"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/proposals`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch proposals");
      return res.json();
    },
  });
}

// Hook to get proposal counts
export function useProposalCounts() {
  const { getToken } = useAuth();
  
  return useQuery<ProposalCounts>({
    queryKey: ["proposal-counts"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/proposals/count`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch counts");
      return res.json();
    },
    refetchInterval: 60000, // Refresh every minute
  });
}

// Hook to get threads needing project link
export function useThreadsNeedingLink() {
  const { getToken } = useAuth();
  
  return useQuery<{ threads: ThreadNeedingLink[] }>({
    queryKey: ["threads-needing-link"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/proposals/threads`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch threads");
      return res.json();
    },
  });
}

// Mutation to resolve a proposal
export function useResolveProposal() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ proposalId, action }: { proposalId: string; action: "accept" | "reject" }) => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/proposals/${proposalId}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error("Failed to resolve proposal");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      queryClient.invalidateQueries({ queryKey: ["proposal-counts"] });
    },
  });
}

// Mutation to link thread to project
export function useLinkThreadToProject() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ threadId, projectId }: { threadId: string; projectId: string }) => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/proposals/threads/${threadId}/link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) throw new Error("Failed to link thread");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threads-needing-link"] });
      queryClient.invalidateQueries({ queryKey: ["proposal-counts"] });
    },
  });
}

// Mutation to dismiss thread
export function useDismissThread() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (threadId: string) => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/proposals/threads/${threadId}/dismiss`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to dismiss thread");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threads-needing-link"] });
      queryClient.invalidateQueries({ queryKey: ["proposal-counts"] });
    },
  });
}


