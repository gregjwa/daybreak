import { hc } from 'hono/client'
import type { AppType } from '@daybreak/backend'
import { getApiBaseUrl } from '@/lib/apiBase'

const API_URL = getApiBaseUrl()

// Create the Hono RPC client with full type safety
// Note: This client should be used with Clerk's auth token
export const client = hc<AppType>(API_URL, {
  headers: async (): Promise<Record<string, string>> => {
    // Get the Clerk session token
    try {
      // @ts-expect-error - Clerk exposes this globally
      const token = await window.Clerk?.session?.getToken()
      if (token) {
        return {
          Authorization: `Bearer ${token}`,
        }
      }
    } catch (error) {
      console.warn('Failed to get Clerk token:', error)
    }
    return {} as Record<string, string>
  },
})
