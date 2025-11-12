import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { clerkMiddleware, getAuth } from '@hono/clerk-auth'

// Create the Hono app
const app = new Hono()
  .use('/*', cors())
  .use('*', clerkMiddleware())

  // Health check
  .get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  // GET /api/events - Get all events (requires authentication)
  .get('/api/events', (c) => {
    const auth = getAuth(c)

    if (!auth?.userId) {
      return c.json(
        {
          error: 'Unauthorized',
          message: 'You must be logged in to view events.'
        },
        401
      )
    }

    const events = [
      {
        id: 1,
        name: 'Sarah & John Wedding',
        date: '2025-06-15',
        type: 'wedding' as const
      },
      {
        id: 2,
        name: 'Album Recording Session',
        date: '2025-03-20',
        type: 'studio recording' as const
      },
      {
        id: 3,
        name: 'Emily & David Wedding',
        date: '2025-07-10',
        type: 'wedding' as const
      },
      {
        id: 4,
        name: 'Podcast Episode 42',
        date: '2025-02-28',
        type: 'studio recording' as const
      }
    ]

    return c.json(events)
  })

// Export the app type for RPC client
export type AppType = typeof app

// Start the server
const port = 3000
console.log(`🚀 Server is running on http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port
})

export default app
