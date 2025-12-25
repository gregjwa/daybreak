import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { getApiBaseUrl } from "@/lib/apiBase";
import { Supplier, ContactMethod } from "./useSuppliers";
import { SupplierCategory } from "./useSupplierCategories";

// Re-export for convenience
export type { Supplier, ContactMethod, SupplierCategory };

// Types (Mirroring backend prisma types roughly)
export interface Project {
  id: string;
  name: string;
  type: string;
  date?: string;
  budget?: number;
  description?: string;
  _count?: { suppliers: number };
  suppliers?: ProjectSupplier[];
}

export interface ProjectSupplierWithMessage extends Supplier {
  messages?: {
    id: string;
    content: string;
    direction: string;
    sentAt: string;
  }[];
}

export interface ProjectSupplier {
    id: string;
    projectId: string;
    supplierId: string;
    role: string;
    status: string;
    quoteAmount?: number;
    notes?: string;
    supplier?: ProjectSupplierWithMessage;
}

const API_URL = getApiBaseUrl();

async function fetcher(url: string, token: string | null) {
  const res = await fetch(`${API_URL}${url}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error("API Error");
  return res.json();
}

export function useProjects() {
  const { getToken } = useAuth();
  return useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => fetcher("/projects", await getToken()),
  });
}

export interface UseProjectOptions {
  /** Poll interval in milliseconds. Set to false to disable polling. Default: false */
  refetchInterval?: number | false;
}

export function useProject(id: string, options: UseProjectOptions = {}) {
    const { getToken } = useAuth();
    return useQuery<Project>({
      queryKey: ["projects", id],
      queryFn: async () => fetcher(`/projects/${id}`, await getToken()),
      enabled: !!id,
      refetchInterval: options.refetchInterval,
      // Only refetch when window is focused if polling is enabled
      refetchIntervalInBackground: false,
    });
  }

export function useCreateProject() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<Project>) => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/projects`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create project");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useAddProjectSupplier() {
    const { getToken } = useAuth();
    const queryClient = useQueryClient();
  
    return useMutation({
      mutationFn: async ({ projectId, data }: { projectId: string; data: any }) => {
        const token = await getToken();
        const res = await fetch(`${API_URL}/projects/${projectId}/suppliers`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error("Failed to link supplier");
        return res.json();
      },
      onSuccess: (_, { projectId }) => {
        queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
      },
    });
  }

