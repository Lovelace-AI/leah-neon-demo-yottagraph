import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let _sql: NeonQueryFunction<false, false> | null = null;

/**
 * Whether a DATABASE_URL is present in the environment. Does not attempt
 * a connection.
 */
export function isDbConfigured(): boolean {
    const url = process.env.DATABASE_URL;
    return Boolean(url && url.startsWith('postgres'));
}

/**
 * Lazy-init Neon Postgres client. Returns null if DATABASE_URL is missing
 * (local dev) so callers can show a graceful "not configured" state.
 */
export function getDb(): NeonQueryFunction<false, false> | null {
    if (_sql) return _sql;
    const url = process.env.DATABASE_URL;
    if (!url || !url.startsWith('postgres')) return null;
    _sql = neon(url);
    return _sql;
}

/**
 * Ensure the application tables exist. Safe to call repeatedly — the
 * `_initialized` flag makes it a no-op after the first call within the
 * same serverless invocation.
 */
let _initialized = false;
export async function ensureTables(): Promise<void> {
    if (_initialized) return;
    const sql = getDb();
    if (!sql) return;

    await sql`CREATE TABLE IF NOT EXISTS imported_entities (
        id SERIAL PRIMARY KEY,
        neid TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        flavor TEXT,
        properties JSONB DEFAULT '{}'::jsonb,
        search_query TEXT,
        imported_at TIMESTAMPTZ DEFAULT NOW()
    )`;

    await sql`CREATE INDEX IF NOT EXISTS imported_entities_name_idx
        ON imported_entities (name)`;

    await sql`CREATE INDEX IF NOT EXISTS imported_entities_flavor_idx
        ON imported_entities (flavor)`;

    _initialized = true;
}
