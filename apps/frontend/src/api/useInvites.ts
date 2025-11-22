import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { client } from '@/lib/api'

export function useCreateInvite(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ email, roleId }: { email: string, roleId?: string }) => {
      const res = await client.api.organizations[':orgId'].invites.$post({
        param: { orgId },
        json: { email, roleId }
      })
      if (!res.ok) throw new Error('Failed to create invite')
      return res.json()
    },
    onMutate: async ({ email, roleId }) => {
      await queryClient.cancelQueries({ queryKey: ['organizations', orgId] })
      const previousOrg = queryClient.getQueryData(['organizations', orgId])

      queryClient.setQueryData(['organizations', orgId], (old: any) => {
        if (!old) return old
        return {
          ...old,
          invites: [
            ...(old.invites || []),
            {
              id: 'temp-invite-' + Date.now(),
              email,
              roleId,
              status: 'PENDING',
              createdAt: new Date().toISOString(),
              // We don't have the token/link yet, but UI will show it in the list
            }
          ]
        }
      })

      return { previousOrg }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousOrg) {
        queryClient.setQueryData(['organizations', orgId], context.previousOrg)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId] })
    }
  })
}

export function useInvitePublic(token: string) {
  return useQuery({
    queryKey: ['invite', token],
    queryFn: async () => {
      const res = await client.api.invites.public[':token'].$get({
        param: { token }
      })
      if (!res.ok) throw new Error('Invalid or expired invite')
      return res.json()
    },
    enabled: !!token,
    retry: false
  })
}

export function useAcceptInvite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (token: string) => {
      const res = await client.api.invites[':token'].accept.$post({
        param: { token }
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to accept invite')
      }
      return res.json()
    },
    onSuccess: () => {
      // Invalidate organizations list so the new membership appears
      queryClient.invalidateQueries({ queryKey: ['organizations'] })
    }
  })
}
