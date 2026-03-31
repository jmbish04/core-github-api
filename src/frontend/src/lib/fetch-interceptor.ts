/**
 * @file frontend/src/lib/fetch-interceptor.ts
 *
 * Global fetch interceptor to catch AI Fallback events across the entire application.
 * If any backend API response includes a `fallbackAlert` JSON flag, a centralized
 * Sonner toast is fired to notify the user that the primary provider failed but
 * was successfully caught by the worker-ai fallback.
 */

import { toast } from 'sonner';

export function setupFetchInterceptor() {
  if (typeof window === 'undefined') return;

  const originalFetch = window.fetch;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(input, init);

    // Only inspect successful JSON responses
    const contentType = response.headers.get('content-type');
    if (response.ok && contentType?.includes('application/json')) {
      try {
        const cloned = response.clone();
        const data: any = await cloned.json();

        // Check for fallback metadata flag injected by the Hono API
        if (data && data.fallbackAlert && data.fallbackAlert.fallbackUsed) {
          const alert = data.fallbackAlert;
          toast.warning(`Provider Failed: ${alert.originalProvider}`, {
            description: `Request caught and completed by worker-ai fallback. Error: ${alert.errorMessage}`,
            duration: 8000,
          });
        }
      } catch (err) {
        // Silently ignore clone parsing errors
      }
    }

    return response;
  };
}
