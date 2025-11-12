import { hc } from 'hono/client'
import type { AppType } from '@daybreak/backend'

// Create the Hono RPC client with full type safety
export const client = hc<AppType>('http://localhost:5173')
