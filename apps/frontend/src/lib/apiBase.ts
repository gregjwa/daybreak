/**
 * Returns the API base URL for fetch + Hono RPC client.
 *
 * Accepts either:
 * - VITE_API_URL="https://<railway-host>"  -> returns "https://<railway-host>/api"
 * - VITE_API_URL="https://<railway-host>/api" -> returns "https://<railway-host>/api"
 */
export function getApiBaseUrl() {
  const raw = import.meta.env.VITE_API_URL || "http://localhost:3000";
  const trimmed = raw.replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

/**
 * Returns the API origin URL (no trailing /api) for the Hono RPC client.
 *
 * Accepts either:
 * - VITE_API_URL="https://<railway-host>" -> returns "https://<railway-host>"
 * - VITE_API_URL="https://<railway-host>/api" -> returns "https://<railway-host>"
 */
export function getApiOriginUrl() {
  const raw = import.meta.env.VITE_API_URL || "http://localhost:3000";
  const trimmed = raw.replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed.slice(0, -4) : trimmed;
}


