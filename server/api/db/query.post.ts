import { getDb, ensureTables } from '~/server/utils/neon';
import { neon } from '@neondatabase/serverless';

/**
 * Run a user-supplied SQL query against the Neon database.
 *
 * Only read-only statements are allowed (SELECT / WITH / EXPLAIN / SHOW).
 * This is a demo app — do NOT copy this pattern for production without
 * stronger isolation (e.g. a read-only role, statement timeout, etc.).
 */
export default defineEventHandler(async (event) => {
    const body = await readBody<{ sql?: string }>(event);
    const raw = (body?.sql ?? '').trim();

    if (!raw) {
        throw createError({ statusCode: 400, statusMessage: 'SQL statement required' });
    }

    const stripped = raw.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const leadingKeyword = stripped.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    const allowed = ['select', 'with', 'explain', 'show', 'table', 'values'];
    if (!allowed.includes(leadingKeyword)) {
        throw createError({
            statusCode: 400,
            statusMessage: `Only read-only queries are allowed (SELECT, WITH, EXPLAIN, SHOW, TABLE, VALUES). Got: ${leadingKeyword || 'empty'}`,
        });
    }

    // Disallow multiple statements.
    const withoutTrailingSemi = stripped.replace(/;\s*$/, '');
    if (withoutTrailingSemi.includes(';')) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Only a single statement is allowed per request',
        });
    }

    const sql = getDb();
    if (!sql) {
        throw createError({ statusCode: 503, statusMessage: 'Database not configured' });
    }

    await ensureTables();

    // Use a fullResults neon client so we get rowCount + field names even
    // for queries that return no rows. The `.query()` method is required for
    // raw-string queries (the callable form is reserved for tagged templates).
    const url = process.env.DATABASE_URL!;
    const fullSql = neon(url, { fullResults: true });

    const started = Date.now();
    try {
        const result: any = await fullSql.query(withoutTrailingSemi, []);
        const elapsed = Date.now() - started;
        const rows: any[] = Array.isArray(result?.rows) ? result.rows : [];
        const fields: Array<{ name: string; dataTypeID?: number }> = Array.isArray(result?.fields)
            ? result.fields.map((f: any) => ({ name: f.name, dataTypeID: f.dataTypeID }))
            : rows.length > 0
              ? Object.keys(rows[0]).map((name) => ({ name }))
              : [];

        return {
            ok: true,
            rowCount: rows.length,
            elapsedMs: elapsed,
            fields,
            rows,
        };
    } catch (err: any) {
        return {
            ok: false,
            error: err?.message ?? String(err),
            elapsedMs: Date.now() - started,
        };
    }
});
