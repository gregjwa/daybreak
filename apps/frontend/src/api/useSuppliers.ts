import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { getApiBaseUrl } from "@/lib/apiBase";
import { SupplierCategory } from "./useSupplierCategories";

const API_URL = getApiBaseUrl();

export interface ContactMethod {
  id: string;
  type: string;
  value: string;
  label?: string | null;
  isPrimary: boolean;
}

export interface SupplierContact {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  isPrimary: boolean;
  contactMethods: ContactMethod[];
}

export interface SupplierToCategory {
  id: string;
  supplierId: string;
  categoryId: string;
  isPrimary: boolean;
  category: SupplierCategory;
}

export interface Supplier {
  id: string;
  name: string;
  domain?: string | null;
  isPersonalDomain: boolean;
  notes?: string | null;
  categories: SupplierToCategory[];
  contacts: SupplierContact[];
  _count?: {
    projectSuppliers?: number;
    messages?: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface SupplierDetail extends Supplier {
  projectSuppliers: {
    id: string;
    role: string;
    status: string;
    quoteAmount?: number | null;
    project: {
      id: string;
      name: string;
      type: string;
      date?: string | null;
    };
  }[];
  messages: {
    id: string;
    content: string;
    direction: string;
    sentAt: string;
    project?: { id: string; name: string } | null;
  }[];
}

export interface CreateSupplierContact {
  name: string;
  email: string;
  role?: string;
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

export function useSuppliers() {
  const { getToken } = useAuth();
  return useQuery<Supplier[]>({
    queryKey: ["suppliers"],
    queryFn: async () => fetcher<Supplier[]>("/suppliers", await getToken()),
  });
}

export function useSupplier(supplierId: string | undefined) {
  const { getToken } = useAuth();
  return useQuery<SupplierDetail>({
    queryKey: ["suppliers", supplierId],
    queryFn: async () => fetcher<SupplierDetail>(`/suppliers/${supplierId}`, await getToken()),
    enabled: !!supplierId,
  });
}

export interface CreateSupplierData {
  name: string;
  domain?: string;
  isPersonalDomain?: boolean;
  categorySlugs?: string[];
  primaryCategory?: string;
  notes?: string;
  contact?: CreateSupplierContact;
}

export function useCreateSupplier() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateSupplierData) => {
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
      return res.json() as Promise<Supplier>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });
}

export interface UpdateSupplierData {
  name?: string;
  categorySlugs?: string[];
  primaryCategory?: string;
  notes?: string;
}

export function useUpdateSupplier() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateSupplierData }) => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/suppliers/${id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update supplier");
      return res.json() as Promise<Supplier>;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers", id] });
    },
  });
}

