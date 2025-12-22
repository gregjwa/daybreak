import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { Supplier } from "./useProjects";
import { getApiBaseUrl } from "@/lib/apiBase";

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

export function useSuppliers() {
  const { getToken } = useAuth();
  return useQuery<Supplier[]>({
    queryKey: ["suppliers"],
    queryFn: async () => fetcher("/suppliers", await getToken()),
  });
}

export function useCreateSupplier() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<Supplier> & { email?: string; phone?: string }) => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/suppliers`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create supplier");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });
}

