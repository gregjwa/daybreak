import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { client } from "@/lib/api";

export interface UserProfile {
  id: string;
  email: string;
  accountType: "BUSINESS" | "PERSON";
  business?: {
    id: string;
    name: string;
    createdAt: string;
  };
  person?: {
    id: string;
    name: string;
    roles: string[];
    businesses: Array<{
      business: {
        id: string;
        name: string;
      };
    }>;
  };
}

/**
 * Hook to fetch current user profile
 */
export function useProfile() {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["profile", "me"],
    queryFn: async () => {
      const token = await getToken();
      const res = await client.api.profile.me.$get(
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) {
        if (res.status === 404) {
          return null; // User doesn't exist in DB yet
        }
        throw new Error("Failed to fetch profile");
      }

      const data = await res.json();
      return data.user as UserProfile;
    },
  });
}

/**
 * Hook to set up a business profile
 */
export function useSetupBusiness() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (businessName: string) => {
      const token = await getToken();
      const res = await client.api.profile["setup-business"].$post(
        {
          json: { businessName },
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
          "error" in errorData ? errorData.error : "Failed to setup business"
        );
      }

      return res.json();
    },
    onSuccess: () => {
      // Invalidate profile query to refetch
      queryClient.invalidateQueries({ queryKey: ["profile", "me"] });
    },
  });
}

