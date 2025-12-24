import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { getApiBaseUrl } from "@/lib/apiBase";

const API_URL = getApiBaseUrl();

async function fetcher<T>(url: string, token: string | null): Promise<T> {
  const res = await fetch(`${API_URL}${url}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error("API Error");
  return res.json();
}

export interface BackfillRun {
  id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  timeframeMonths: number;
  scannedMessages: number;
  discoveredContacts: number;
  createdCandidates: number;
  errorsCount: number;
  startedAt: string | null;
  completedAt: string | null;
  hasMorePages: boolean;
}

export interface BackfillTickResult {
  done: boolean;
  scannedThisTick: number;
  discoveredThisTick: number;
  createdThisTick: number;
  nextPageToken: string | null;
  progress: {
    scannedMessages: number;
    discoveredContacts: number;
    createdCandidates: number;
    errorsCount: number;
  };
}

export interface ActiveRunResponse {
  activeRun: {
    id: string;
    status: string;
    scannedMessages: number;
    createdCandidates: number;
    startedAt: string | null;
  } | null;
}

// Get active backfill run
export function useActiveBackfill() {
  const { getToken } = useAuth();
  return useQuery<ActiveRunResponse>({
    queryKey: ["backfill", "active"],
    queryFn: async () => fetcher<ActiveRunResponse>("/emails/backfill/active", await getToken()),
    refetchInterval: (query) => {
      // Poll if there's an active run
      const data = query.state.data;
      if (data?.activeRun && (data.activeRun.status === "PENDING" || data.activeRun.status === "RUNNING")) {
        return 2000;
      }
      return false;
    },
  });
}

// Get backfill run status
export function useBackfillStatus(runId: string | null) {
  const { getToken } = useAuth();
  return useQuery<BackfillRun>({
    queryKey: ["backfill", runId],
    queryFn: async () => fetcher<BackfillRun>(`/emails/backfill/${runId}/status`, await getToken()),
    enabled: !!runId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && (data.status === "PENDING" || data.status === "RUNNING")) {
        return 1000;
      }
      return false;
    },
  });
}

// Start backfill
export function useStartBackfill() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (timeframeMonths: number = 6) => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/emails/backfill/start`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ timeframeMonths }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to start backfill");
      }
      return res.json() as Promise<{ success: boolean; runId: string; gmailQuery: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backfill", "active"] });
    },
  });
}

// Process one tick of backfill
export function useBackfillTick() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (runId: string) => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/emails/backfill/${runId}/tick`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to process tick");
      }
      return res.json() as Promise<BackfillTickResult>;
    },
    onSuccess: (_, runId) => {
      queryClient.invalidateQueries({ queryKey: ["backfill", runId] });
      queryClient.invalidateQueries({ queryKey: ["backfill", "active"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-candidates"] });
    },
  });
}

// Cancel backfill
export function useCancelBackfill() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (runId: string) => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/emails/backfill/${runId}/cancel`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) throw new Error("Failed to cancel");
      return res.json();
    },
    onSuccess: (_, runId) => {
      queryClient.invalidateQueries({ queryKey: ["backfill", runId] });
      queryClient.invalidateQueries({ queryKey: ["backfill", "active"] });
    },
  });
}

