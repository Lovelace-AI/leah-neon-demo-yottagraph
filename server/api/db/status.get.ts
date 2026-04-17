import { getDb, isDbConfigured, ensureTables } from '~/server/utils/neon';

export default defineEventHandler(async () => {
    const configured = isDbConfigured();
    if (!configured) {
        return {
            configured: false,
            connected: false,
            message:
                'DATABASE_URL is not set. Locally, Neon credentials are not yet available — push to main to test with the deployed database.',
        };
    }

    const sql = getDb();
    if (!sql) {
        return { configured: true, connected: false, message: 'Failed to initialize Neon client' };
    }

    try {
        await ensureTables();
        const rows = (await sql`SELECT COUNT(*)::int AS count FROM imported_entities`) as Array<{
            count: number;
        }>;
        return {
            configured: true,
            connected: true,
            rowCount: rows[0]?.count ?? 0,
        };
    } catch (err: any) {
        return {
            configured: true,
            connected: false,
            message: err?.message ?? 'Connection failed',
        };
    }
});
