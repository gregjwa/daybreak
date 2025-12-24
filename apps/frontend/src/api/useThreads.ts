import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { getApiBaseUrl } from "@/lib/apiBase";

const API_URL = getApiBaseUrl();

export interface EmailThread {
  id: string;
  gmailThreadId: string;
  subject: string | null;
  participantEmails: string[];
  messageCount: number;
  currentStatus: string | null;
  detectedProjectId: string | null;
  detectedProjectConf: number | null;
  lastAnalyzedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadMessage {
  id: string;
  subject: string | null;
  content: string;
  contentClean: string | null;
  direction: "INBOUND" | "OUTBOUND";
  sentAt: string;
  detectedStatusSlug: string | null;
  statusConfidence: number | null;
  statusSignals: string[];
}

export interface ThreadDetail extends EmailThread {
  messages: ThreadMessage[];
  project?: {
    id: string;
    name: string;
  } | null;
  supplier?: {
    id: string;
    name: string;
  } | null;
}

// Hook to fetch thread detail
export function useThreadDetail(threadId: string | undefined) {
  const { getToken } = useAuth();
  
  return useQuery<ThreadDetail>({
    queryKey: ["thread", threadId],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/threads/${threadId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch thread");
      return res.json();
    },
    enabled: !!threadId,
  });
}

// Hook to fetch threads for a project
export function useProjectThreads(projectId: string | undefined) {
  const { getToken } = useAuth();
  
  return useQuery<EmailThread[]>({
    queryKey: ["project-threads", projectId],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/threads?projectId=${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch threads");
      const data = await res.json();
      return data.threads;
    },
    enabled: !!projectId,
  });
}

