import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/clerk-react'
import { client } from '@/lib/api'

// Fetch functions exported for prefetching
export const fetchOrganizations = async () => {
  const res = await client.api.organizations.$get()
  if (!res.ok) throw new Error('Failed to fetch organizations')
  return res.json()
}

export const fetchOrganization = async (id: string) => {
  const res = await client.api.organizations[':id'].$get({
    param: { id }
  })
  if (!res.ok) throw new Error('Failed to fetch organization')
  return res.json()
}

export function useOrganizations() {
  const { isSignedIn } = useAuth()
  
  return useQuery({
    queryKey: ['organizations'],
    queryFn: fetchOrganizations,
    enabled: isSignedIn,
  })
}

export function useCreateOrganization() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (name: string) => {
      const res = await client.api.organizations.$post({
        json: { name }
      })
      if (!res.ok) throw new Error('Failed to create organization')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] })
    }
  })
}

export function useOrganization(id: string) {
  const { isSignedIn } = useAuth()

  return useQuery({
    queryKey: ['organizations', id],
    queryFn: () => fetchOrganization(id),
    enabled: !!id && isSignedIn,
  })
}

export function useDeleteOrganization() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await client.api.organizations[':id'].$delete({
        param: { id }
      })
      if (!res.ok) throw new Error('Failed to delete organization')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] })
    }
  })
}
