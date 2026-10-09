// Client-side requests hit the Vite dev proxy ("/backend-api" -> backend's
// "/api", see nuxt.config.ts -- a distinct prefix because "/api" itself is
// reserved by Nuxt modules). SSR requests run inside the Node process itself
// and never reach that proxy (it only intercepts real HTTP connections to
// the dev server), so they need the backend's absolute URL directly.
const SERVER_API_BASE = "http://localhost:8000/api";

export const BACKEND_UNREACHABLE = "Cannot reach the backend. Make sure it is running on http://localhost:8000.";

/** True for network-level failures (backend down, refused connection, proxy 502/503/504). */
export function isBackendUnreachable(e: any): boolean {
  const status = e?.status ?? e?.response?.status;
  return !status || status === 502 || status === 503 || status === 504;
}

export async function apiFetch<T>(path: string, opts: Parameters<typeof $fetch>[1] = {}): Promise<T> {
  const base = import.meta.server ? SERVER_API_BASE : "/backend-api";
  try {
    return await $fetch<T>(`${base}${path}`, opts);
  } catch (e: any) {
    // Pages read `e.data.detail` for their message; give network failures one
    // too so they show something actionable instead of a generic fallback.
    if (isBackendUnreachable(e)) e.data = { ...e.data, detail: BACKEND_UNREACHABLE, unreachable: true };
    throw e;
  }
}
