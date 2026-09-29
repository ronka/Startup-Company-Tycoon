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
  /** True while seeded samples are ranked alongside real players (the website's mixed mode). */
  samplesIncluded: boolean;
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
    samplesIncluded: body.samplesIncluded === true,
    total: isFiniteNumber(body.total) ? body.total : rows.length,
    rows,
    nextCursor: typeof body.nextCursor === 'string' && body.nextCursor.length > 0 ? body.nextCursor : null,
  };
}

/** `fetch` with the module's timeout, chained to an optional caller signal. */
async function timedFetch(url: string, init: RequestInit = {}, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
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
  const response = await timedFetch(`${LEADERBOARD_ORIGIN}/api/leaderboard?${params}`, {}, signal);
  if (!response.ok) throw new Error(`leaderboard ${response.status}`);
  const page = parseBoardPage(await response.json());
  if (!page) throw new Error('leaderboard: malformed response');
  return page;
}

export type BoardRank = {
  /** 1-based position this stake holds (or would hold) on the public board. */
  rank: number;
  /** Everyone on the board, counting this run only when `onBoard`. */
  total: number;
  /** Whether the `runId` asked about is itself a public row. */
  onBoard: boolean;
};

/** A rank response body, or `null` when it's not one. Off-board runs count themselves into `total`. */
export function parseBoardRank(raw: unknown): BoardRank | null {
  if (raw == null || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;
  if (!isFiniteNumber(body.rank) || !isFiniteNumber(body.total) || body.rank < 1) return null;
  const onBoard = body.onBoard === true;
  const total = onBoard ? body.total : body.total + 1;
  return { rank: body.rank, total: Math.max(total, body.rank), onBoard };
}

/**
 * Where `founderStake` ranks on the public board — without uploading anything,
 * so it works for players who never opted in. Throws on any failure (including
 * a 404 from a website that doesn't serve the route yet); callers hide the rank.
 */
export async function fetchBoardRank(
  founderStake: number,
  runId: string | null,
  signal?: AbortSignal,
): Promise<BoardRank> {
  const params = new URLSearchParams({ stake: String(Math.max(0, Math.round(founderStake))) });
  if (runId) params.set('runId', runId);
  const response = await timedFetch(`${LEADERBOARD_ORIGIN}/api/leaderboard/rank?${params}`, {}, signal);
  if (!response.ok) throw new Error(`leaderboard rank ${response.status}`);
  const rank = parseBoardRank(await response.json());
  if (!rank) throw new Error('leaderboard rank: malformed response');
  return rank;
}

/** The exact body `PUT /api/leaderboard/runs/:runId` accepts — no other keys, or the server rejects it. */
export type RunUpload = {
  companyName: string;
  week: number;
  stage: string;
  outcome: BoardOutcome;
  founderStake: number;
  valuation: number | null;
  founderEquity: number | null;
  revision: number;
  publish: true;
};

/**
 * `ok` landed (or was already there); `conflict` means the server holds a
 * newer or incompatible snapshot and retrying this one is pointless;
 * `unauthorized` means the session is gone; `retry` is everything transient.
 */
export type WriteResult = 'ok' | 'conflict' | 'unauthorized' | 'retry';

function writeResultFor(status: number): WriteResult {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 401) return 'unauthorized';
  if (status === 409 || status === 400) return 'conflict';
  return 'retry';
}

/** The write's outcome plus the raw HTTP status (null when the request never got an answer), for failure analytics. */
export async function putRun(
  token: string,
  runId: string,
  body: RunUpload,
): Promise<{ result: WriteResult; status: number | null }> {
  try {
    const response = await timedFetch(`${LEADERBOARD_ORIGIN}/api/leaderboard/runs/${runId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return { result: writeResultFor(response.status), status: response.status };
  } catch {
    return { result: 'retry', status: null };
  }
}

/** Unpublish one of this account's runs. A 404 counts as done — there's nothing left to remove. */
export async function deleteRun(token: string, runId: string): Promise<WriteResult> {
  try {
    const response = await timedFetch(`${LEADERBOARD_ORIGIN}/api/leaderboard/runs/${runId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.status === 404 ? 'ok' : writeResultFor(response.status);
  } catch {
    return 'retry';
  }
}
