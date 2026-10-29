const GREEN = 32;
const YELLOW = 33;
const RED = 31;
export const CYAN = 36;
export const DIM = 2;

type Upstream = [label: string, baseUrl: string];

const globalWithFetch = globalThis as typeof globalThis & { hgOriginalFetch?: typeof fetch };

export function paint(text: string | number, code: number): string {
  return `\x1b[${code}m${text}\x1b[0m`;
}

// spec-3 E1, E3
export function logTiming(label: string, method: string, url: string, statusCode: number, startedAt: number): void {
  const ms = Math.round(performance.now() - startedAt);
  const statusColor = statusCode >= 500 || statusCode === 0 ? RED : statusCode >= 400 ? YELLOW : GREEN;
  const status = paint(statusCode, statusColor);
  const time = paint(`${ms} ms`, ms >= 1000 ? RED : ms >= 300 ? YELLOW : GREEN);
  // check-ignore console: saída colorida do terminal (spec-3 E1)
  console.debug(`${paint(`[${label}]`, DIM)} ${paint(method, CYAN)} ${url} → ${status} (${time})`);
}

// spec-3 E2
export function timeUpstreamFetch(): void {
  const candidates: [string, string | undefined][] = [
    ["supabase", process.env.SUPABASE_URL],
    ["transicionais", process.env.TRANSICIONAIS_URL],
  ];
  const upstreams = candidates.filter((upstream): upstream is Upstream => Boolean(upstream[1]));
  globalWithFetch.hgOriginalFetch ??= globalThis.fetch;
  const originalFetch = globalWithFetch.hgOriginalFetch;

  if (!upstreams.length) {
    return;
  }

  const timedFetch: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const upstream = upstreams.find(([, baseUrl]) => url.startsWith(baseUrl));

    if (!upstream) {
      return originalFetch(input, init);
    }

    const label = upstream[0];
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const { pathname, search } = new URL(url);
    const shown = decodeURIComponent(pathname + search).slice(0, 120);
    const startedAt = performance.now();

    try {
      const response = await originalFetch(input, init);
      logTiming(label, method, shown, response.status, startedAt);
      return response;
    } catch (error) {
      logTiming(label, method, shown, 0, startedAt);
      throw error;
    }
  };

  globalThis.fetch = timedFetch;
}
