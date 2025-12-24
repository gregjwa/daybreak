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

export interface SupplierCandidate {
  id: string;
  userId: string;
  email: string;
  domain: string;
  displayName: string | null;
  source: string;
  status: "NEW" | "ACCEPTED" | "DISMISSED" | "MERGED";
  messageCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  suggestedSupplierName: string | null;
  suggestedCategoryName: string | null;
  confidence: number | null;
  enrichmentJson: any;
  supplierId: string | null;
  createdAt: string;
  updatedAt: string;
}

// List candidates
export function useSupplierCandidates(status?: string, search?: string) {
  const { getToken } = useAuth();
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (search) params.set("search", search);
  const queryString = params.toString();

  return useQuery<SupplierCandidate[]>({
    queryKey: ["supplier-candidates", status || "all", search || ""],
    queryFn: async () =>
      fetcher<SupplierCandidate[]>(
        `/supplier-candidates${queryString ? `?${queryString}` : ""}`,
        await getToken()
      ),
  });
}

// Accept a candidate
export function useAcceptCandidate() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      candidateId,
      supplierName,
      categoryName,
    }: {
      candidateId: string;
      supplierName?: string;
      categoryName?: string;
    }) => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/supplier-candidates/${candidateId}/accept`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ supplierName, categoryName }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to accept");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });
}

// Dismiss a candidate
export function useDismissCandidate() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (candidateId: string) => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/supplier-candidates/${candidateId}/dismiss`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) throw new Error("Failed to dismiss");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-candidates"] });
    },
  });
}

// Bulk accept candidates
export function useBulkAcceptCandidates() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (candidateIds: string[]) => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/supplier-candidates/bulk-accept`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ candidateIds }),
      });
      if (!res.ok) throw new Error("Failed to bulk accept");
      return res.json() as Promise<{
        success: boolean;
        accepted: number;
        failed: number;
        results: { candidateId: string; supplierId?: string; error?: string }[];
      }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });
}

// Bulk dismiss candidates
export function useBulkDismissCandidates() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (candidateIds: string[]) => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/supplier-candidates/bulk-dismiss`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ candidateIds }),
      });
      if (!res.ok) throw new Error("Failed to bulk dismiss");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-candidates"] });
    },
  });
}

// Enrich candidates with AI
export function useEnrichCandidates() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      candidateIds,
      scrapeDomain,
    }: {
      candidateIds: string[];
      scrapeDomain?: boolean;
    }) => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/supplier-candidates/enrich`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ candidateIds, scrapeDomain }),
      });
      if (!res.ok) throw new Error("Failed to enrich");
      return res.json() as Promise<{ success: boolean; enriched: number; errors: number }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-candidates"] });
    },
  });
}

