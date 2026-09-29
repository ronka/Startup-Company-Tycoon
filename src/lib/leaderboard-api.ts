/**
 * Read-only client for the website's public leaderboard API
 * (`startup-tycoon-website`, `GET /api/leaderboard`).
 *
 * Deliberately not `account/api.ts`'s `apiOrigin()`: that's the Expo-hosted
 * entitlement API. The leaderboard lives on the separate Next.js site, so its
 * host is its own constant — change it here when the site gets its real domain.
 *
 * Parsing is defensive: this ships to a live app via OTA while the server keeps
 * evolving, so an unexpected field drops the row instead of crashing the screen.
 */

export const LEADERBOARD_ORIGIN = 'https://startup-tycoon-website.vercel.app';

const REQUEST_TIMEOUT_MS = 8000;

export const BOARD_FILTERS = ['all', 'running', 'exited', 'bankrupt'] as const;
export type BoardFilter = (typeof BOARD_FILTERS)[number];

export type BoardOutcome = 'running' | 'bankrupt' | 'acquired' | 'ipo';

export type BoardRow = {
  runId: string;
  /** Real overall rank; `null` for sample rows (which are never ranked). */
  rank: number | null;
  companyName: string;
  week: number;
  sector: string | null;
  /** The app's `Stage` values in practice, but kept a string so new stages don't drop rows. */
  stage: string;
  outcome: BoardOutcome;
  founderStake: number;
  sample: boolean;
};

export type BoardPage = {
  /** `preview` while the board shows fictional samples; `live` once real players are public. */
  mode: 'preview' | 'live';
  total: number;
  rows: BoardRow[];
  /** Opaque — pass back as-is to fetch the next page. */
  nextCursor: string | null;
};

const OUTCOMES: readonly string[] = ['running', 'bankrupt', 'acquired', 'ipo'];

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** One row off the wire, or `null` when it's missing anything the UI needs. */
export function parseBoardRow(raw: unknown): BoardRow | null {
  if (raw == null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.runId !== 'string' || typeof r.companyName !== 'string') return null;
  if (!isFiniteNumber(r.week) || !isFiniteNumber(r.founderStake)) return null;
  if (typeof r.outcome !== 'string' || !OUTCOMES.includes(r.outcome)) return null;
  return {
    runId: r.runId,
    rank: isFiniteNumber(r.rank) ? r.rank : null,
    companyName: r.companyName,
    week: r.week,
    sector: typeof r.sector === 'string' ? r.sector : null,
    stage: typeof r.stage === 'string' ? r.stage : '',
    outcome: r.outcome as BoardOutcome,
    founderStake: r.founderStake,
    sample: r.sample === true,
  };
}

/** A whole response body, or `null` when its shape isn't a board page at all. */
export function parseBoardPage(raw: unknown): BoardPage | null {
  if (raw == null || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;
  if (!Array.isArray(body.rows)) return null;
  const rows = body.rows.map(parseBoardRow).filter((row): row is BoardRow => row !== null);
  return {
    mode: body.mode === 'live' ? 'live' : 'preview',
    total: isFiniteNumber(body.total) ? body.total : rows.length,
    rows,
    nextCursor: typeof body.nextCursor === 'string' && body.nextCursor.length > 0 ? body.nextCursor : null,
  };
}

/**
 * One page of the board. Throws on network failure, timeout, a non-2xx
 * (including the server's 503 `unavailable`), or an unparseable body — the
 * screen treats every one of those as a retryable error.
 */
export async function fetchBoardPage(
  filter: BoardFilter,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<BoardPage> {
  const params = new URLSearchParams({ status: filter, limit: '20' });
  if (cursor) params.set('cursor', cursor);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller);
  try {
    const response = await fetch(`${LEADERBOARD_ORIGIN}/api/leaderboard?${params}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`leaderboard ${response.status}`);
    const page = parseBoardPage(await response.json());
    if (!page) throw new Error('leaderboard: malformed response');
    return page;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}
