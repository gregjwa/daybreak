import { useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useAuth } from '@clerk/clerk-react'
import { client } from '@/lib/api'

/**
 * Hook to automatically set up Gmail watch when user is authenticated
 * This ensures the user's inbox is monitored for booking inquiries
 */
export function useGmailWatch() {
  const { isSignedIn, isLoaded } = useAuth()

  const { mutate: setupWatch, isError, error } = useMutation({
    mutationFn: async () => {
      const response = await client.api.emails.watch.$post()

      if (!response.ok) {
        const errorData = await response.json()
        const errorMessage =
          'error' in errorData ? errorData.error : 'Failed to set up Gmail watch'
        throw new Error(errorMessage)
      }

      return response.json()
    },
    onSuccess: (data) => {
      console.log('✅ Gmail watch set up successfully:', {
        gmailAddress: data.gmailAddress,
        expiresAt: new Date(Number(data.expiration)).toLocaleString(),
      })
    },
    onError: (error) => {
      // Silently fail - user might not have Gmail connected yet
      console.log('Gmail watch setup skipped:', error)
    },
    retry: 2, // Retry up to 2 times if it fails
    retryDelay: 1000, // Wait 1 second between retries
  })

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return

    console.log('Setting up Gmail watch...')
    setupWatch()
  }, [isSignedIn, isLoaded, setupWatch])

  return { isError, error }
}
