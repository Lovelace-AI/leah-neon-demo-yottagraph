import { getDb, ensureTables } from '~/server/utils/neon';

export default defineEventHandler(async () => {
    const sql = getDb();
    if (!sql) {
        throw createError({ statusCode: 503, statusMessage: 'Database not configured' });
    }

    await ensureTables();

    const rows = (await sql`
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position
    `) as Array<{ table_name: string; column_name: string; data_type: string }>;

    const tables: Record<string, { name: string; columns: Array<{ name: string; type: string }> }> =
        {};
    for (const row of rows) {
        if (!tables[row.table_name]) {
            tables[row.table_name] = { name: row.table_name, columns: [] };
        }
        tables[row.table_name].columns.push({ name: row.column_name, type: row.data_type });
    }

    return { tables: Object.values(tables) };
});
