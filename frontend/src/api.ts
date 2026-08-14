import type { OptimizeRequest, OptimizeResponse } from './types';

export async function runOptimization(req: OptimizeRequest): Promise<OptimizeResponse> {
  const res = await fetch('/api/optimize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = Array.isArray(body.detail)
      ? body.detail.map((d: { msg: string }) => d.msg.replace(/^Value error, /, '')).join('; ')
      : null;
    throw new Error(detail ?? body.message ?? `Server error ${res.status}`);
  }

  return res.json() as Promise<OptimizeResponse>;
}
