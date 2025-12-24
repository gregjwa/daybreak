import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { getApiBaseUrl } from "@/lib/apiBase";

const API_URL = getApiBaseUrl();

export interface SupplierStatus {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  order: number;
  color: string | null;
  inboundSignals: string[];
  outboundSignals: string[];
  threadPatterns: string[];
  isEnabled: boolean;
}

export interface EnabledStatus {
  slug: string;
  name: string;
  color: string | null;
  order: number;
}

// Hook to fetch all statuses with user config
export function useStatuses() {
  const { getToken } = useAuth();
  
  return useQuery<{ statuses: SupplierStatus[] }>({
    queryKey: ["statuses"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/statuses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch statuses");
      return res.json();
    },
  });
}

// Hook to fetch only enabled statuses
export function useEnabledStatuses() {
  const { getToken } = useAuth();
  
  return useQuery<{ statuses: EnabledStatus[] }>({
    queryKey: ["statuses-enabled"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/statuses/enabled`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch statuses");
      return res.json();
    },
  });
}

// Mutation to toggle status enabled/disabled
export function useToggleStatus() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ slug, isEnabled }: { slug: string; isEnabled: boolean }) => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/statuses/${slug}/config`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isEnabled }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["statuses"] });
      queryClient.invalidateQueries({ queryKey: ["statuses-enabled"] });
    },
  });
}

// Get status color by slug
export function getStatusColor(slug: string): string {
  const colors: Record<string, string> = {
    needed: "#6B7280",
    shortlisted: "#8B5CF6",
    "rfq-sent": "#3B82F6",
    "quote-received": "#06B6D4",
    negotiating: "#F59E0B",
    confirmed: "#10B981",
    contracted: "#059669",
    "deposit-paid": "#7C3AED",
    fulfilled: "#14B8A6",
    "paid-in-full": "#22C55E",
  };
  return colors[slug] || "#6B7280";
}

// Get status display name by slug
export function getStatusName(slug: string): string {
  const names: Record<string, string> = {
    needed: "Needed",
    shortlisted: "Shortlisted",
    "rfq-sent": "RFQ Sent",
    "quote-received": "Quote Received",
    negotiating: "Negotiating",
    confirmed: "Confirmed",
    contracted: "Contracted",
    "deposit-paid": "Deposit Paid",
    fulfilled: "Fulfilled",
    "paid-in-full": "Paid in Full",
  };
  return names[slug] || slug;
}

