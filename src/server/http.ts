/** Shared HTTP helpers for provider clients: bounded retries with backoff and Retry-After support. */

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly provider: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export type RetryOptions = {
  provider: string;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function retryAfterMs(res: Response): number | null {
  const header = res.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

export async function fetchWithRetry(url: string, init: RequestInit, opts: RetryOptions): Promise<Response> {
  const maxAttempts = opts.maxAttempts ?? 4;
  const base = opts.baseDelayMs ?? 500;
  const maxDelay = opts.maxDelayMs ?? 30_000;
  const sleep = opts.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000) });
      const transient = res.status === 429 || res.status >= 500;
      if (!transient || attempt === maxAttempts) return res;
      const wait = Math.min(retryAfterMs(res) ?? base * 2 ** (attempt - 1), maxDelay);
      if (wait >= maxDelay && res.status === 429) return res; // quota exhausted: surface it
      await sleep(wait + Math.floor(Math.random() * 100));
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) break;
      await sleep(Math.min(base * 2 ** (attempt - 1), maxDelay));
    }
  }
  throw new ProviderError(`${opts.provider} request failed: ${String(lastError)}`, 0, opts.provider, true);
}

/** Simple serial rate limiter (requests per second) for providers with per-second quotas. */
export function createThrottle(perSecond: number) {
  const interval = 1000 / perSecond;
  let next = 0;
  return async function throttle() {
    const now = Date.now();
    const wait = Math.max(0, next - now);
    next = Math.max(now, next) + interval;
    if (wait > 0) await defaultSleep(wait);
  };
}
