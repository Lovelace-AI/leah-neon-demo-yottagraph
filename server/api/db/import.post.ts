import { getDb, ensureTables } from '~/server/utils/neon';

interface ImportRequest {
    query?: string;
    entities: Array<{
        neid: string;
        name: string;
        flavor?: string;
        properties?: Record<string, unknown>;
    }>;
}

/**
 * Upsert a batch of entities into the `imported_entities` table.
 *
 * The client is responsible for fetching the property data from the
 * Elemental API and posting it here; this keeps the server route simple
 * and lets the UI show per-entity progress.
 */
export default defineEventHandler(async (event) => {
    const body = await readBody<ImportRequest>(event);
    const entities = body?.entities ?? [];
    const query = body?.query ?? null;

    if (!Array.isArray(entities) || entities.length === 0) {
        throw createError({ statusCode: 400, statusMessage: 'No entities provided' });
    }

    const sql = getDb();
    if (!sql) {
        throw createError({ statusCode: 503, statusMessage: 'Database not configured' });
    }

    await ensureTables();

    let inserted = 0;
    let updated = 0;
    const errors: Array<{ neid: string; message: string }> = [];

    for (const entity of entities) {
        if (!entity.neid || !entity.name) {
            errors.push({
                neid: entity.neid ?? '(missing)',
                message: 'neid and name are required',
            });
            continue;
        }
        try {
            const rows = (await sql`
                INSERT INTO imported_entities (neid, name, flavor, properties, search_query)
                VALUES (
                    ${entity.neid},
                    ${entity.name},
                    ${entity.flavor ?? null},
                    ${JSON.stringify(entity.properties ?? {})}::jsonb,
                    ${query}
                )
                ON CONFLICT (neid) DO UPDATE SET
                    name = EXCLUDED.name,
                    flavor = COALESCE(EXCLUDED.flavor, imported_entities.flavor),
                    properties = EXCLUDED.properties,
                    search_query = COALESCE(EXCLUDED.search_query, imported_entities.search_query),
                    imported_at = NOW()
                RETURNING (xmax = 0) AS is_insert
            `) as Array<{ is_insert: boolean }>;
            if (rows[0]?.is_insert) {
                inserted += 1;
            } else {
                updated += 1;
            }
        } catch (err: any) {
            errors.push({ neid: entity.neid, message: err?.message ?? String(err) });
        }
    }

    return { inserted, updated, errors };
});
