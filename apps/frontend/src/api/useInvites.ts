import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { client } from "@/lib/api";

export interface CreateInviteParams {
  inviteType: "PERSON" | "BUSINESS";
  email?: string;
  expiresInDays?: number;
}

export interface InviteDetails {
  inviteType: "PERSON" | "BUSINESS";
  email: string | null;
  expiresAt: string;
  senderBusiness?: string;
}

export interface AcceptInviteParams {
  inviteCode: string;
  name: string;
  roles?: string[];
}

/**
 * Hook to create a new invite
 */
export function useCreateInvite() {
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (params: CreateInviteParams) => {
      const token = await getToken();
      const res = await client.api.invites.create.$post(
        {
          json: params,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(
          "error" in errorData ? errorData.error : "Failed to create invite"
        );
      }

      return res.json();
    },
  });
}

/**
 * Hook to validate an invite code
 */
export function useValidateInvite(code: string) {
  return useQuery({
    queryKey: ["invites", "validate", code],
    queryFn: async () => {
      const res = await client.api.invites.validate[":code"].$get({
        param: { code },
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(
          "error" in errorData
            ? errorData.error
            : "Failed to validate invite"
        );
      }

      const data = await res.json();
      return data;
    },
    enabled: !!code,
    retry: false,
  });
}

/**
 * Hook to accept an invite
 */
export function useAcceptInvite() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: AcceptInviteParams) => {
      const token = await getToken();
      const res = await client.api.invites.accept.$post(
        {
          json: params,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(
          "error" in errorData ? errorData.error : "Failed to accept invite"
        );
      }

      return res.json();
    },
    onSuccess: () => {
      // Invalidate profile to refetch with new account data
      queryClient.invalidateQueries({ queryKey: ["profile", "me"] });
    },
  });
}

