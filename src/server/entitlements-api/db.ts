/**
 * EAS Hosting runs API routes on a worker-style runtime, not full Node — the
 * `pg` driver needs `node:net` and won't work here. `@neondatabase/serverless`
 * talks to Postgres over HTTP (`fetch`-based), which is why it's the one this
 * whole `api/` tree is built around.
 *
 * Lazily constructed: `eas deploy` imports each route module to detect its
 * exported HTTP methods before any request has actually run, and does so
 * without `DATABASE_URL` in scope. A top-level `neon(process.env.DATABASE_URL!)`
 * throws during that import, failing the deploy outright — so the instance is
 * built on first real use instead, by which point the runtime has the secret.
 */
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let instance: NeonQueryFunction<false, false> | undefined;

export function getSql(): NeonQueryFunction<false, false> {
  if (!instance) instance = neon(process.env.DATABASE_URL!);
  return instance;
}
