import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/clerk-react'
import { client } from '@/lib/api'

export function useRoles(orgId: string) {
  const { isSignedIn } = useAuth()

  return useQuery({
    queryKey: ['roles', orgId],
    queryFn: async () => {
      const res = await client.api.organizations[':orgId'].roles.$get({
        param: { orgId }
      })
      if (!res.ok) throw new Error('Failed to fetch roles')
      return res.json()
    },
    enabled: !!orgId && isSignedIn,
  })
}

export function useCreateRole(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (name: string) => {
      const res = await client.api.organizations[':orgId'].roles.$post({
        param: { orgId },
        json: { name }
      })
      if (!res.ok) throw new Error('Failed to create role')
      return res.json()
    },
    onMutate: async (newName) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['roles', orgId] })

      // Snapshot the previous value
      const previousRoles = queryClient.getQueryData(['roles', orgId])

      // Optimistically update to the new value
      queryClient.setQueryData(['roles', orgId], (old: any[] = []) => [
        ...old,
        { id: 'temp-id-' + Date.now(), name: newName, organizationId: orgId }
      ])

      // Return a context object with the snapshotted value
      return { previousRoles }
    },
    onError: (_err, _newName, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousRoles) {
        queryClient.setQueryData(['roles', orgId], context.previousRoles)
      }
    },
    onSettled: () => {
      // Always refetch after error or success:
      queryClient.invalidateQueries({ queryKey: ['roles', orgId] })
    }
  })
}
