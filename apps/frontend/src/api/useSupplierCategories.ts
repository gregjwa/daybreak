import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { getApiBaseUrl } from "@/lib/apiBase";

const API_URL = getApiBaseUrl();

export interface SupplierCategory {
  id: string;
  name: string;
  slug: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

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

export function useSupplierCategories(query?: string) {
  const { getToken } = useAuth();
  const queryParam = query ? `?query=${encodeURIComponent(query)}` : "";
  
  return useQuery<SupplierCategory[]>({
    queryKey: ["supplier-categories", query || ""],
    queryFn: async () => fetcher(`/supplier-categories${queryParam}`, await getToken()),
  });
}

export function useCreateSupplierCategory() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/supplier-categories`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to create category");
      return res.json() as Promise<SupplierCategory>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-categories"] });
    },
  });
}

