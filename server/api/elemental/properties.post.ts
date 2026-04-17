interface PropertyRequest {
    neids: string[];
    pids?: number[];
}

/**
 * Fetch property values for one or more entities via the Portal Gateway.
 * Automatically loads the schema on the server to translate requested
 * PIDs back into human-readable property names.
 */
export default defineEventHandler(async (event) => {
    const body = await readBody<PropertyRequest>(event);
    const neids = body?.neids ?? [];
    if (!Array.isArray(neids) || neids.length === 0) {
        throw createError({ statusCode: 400, statusMessage: 'neids required' });
    }

    const { public: config } = useRuntimeConfig();
    const gatewayUrl = (config as any).gatewayUrl as string;
    const orgId = (config as any).tenantOrgId as string;
    const apiKey = (config as any).qsApiKey as string;

    if (!gatewayUrl || !orgId) {
        throw createError({ statusCode: 503, statusMessage: 'Gateway not configured' });
    }

    const base = `${gatewayUrl}/api/qs/${orgId}`;
    const headers: Record<string, string> = apiKey ? { 'X-Api-Key': apiKey } : {};

    // Discover the schema so we can pick a useful default set of PIDs and
    // map numeric IDs back to property names in the response.
    const schemaRes = await $fetch<any>(`${base}/elemental/metadata/schema`, { headers });
    const schemaProps: Array<{ pid?: number | string; name: string; type?: string }> =
        schemaRes?.schema?.properties ?? schemaRes?.properties ?? [];

    const pidToName = new Map<string, string>();
    for (const p of schemaProps) {
        pidToName.set(String(p.pid), p.name);
    }

    const defaultNames = [
        'name',
        'country',
        'industry',
        'sector',
        'website',
        'ticker',
        'lei_code',
        'description',
        'short_description',
        'headquarters',
        'ceo',
    ];
    const requestedPids =
        body?.pids && body.pids.length > 0
            ? body.pids.map(Number)
            : schemaProps
                  .filter((p) => defaultNames.includes(p.name))
                  .map((p) => Number(p.pid))
                  .filter((n) => Number.isFinite(n));

    if (requestedPids.length === 0) {
        return { properties: neids.map((neid) => ({ neid, values: {} })) };
    }

    const propsRes = await $fetch<any>(`${base}/elemental/entities/properties`, {
        method: 'POST',
        headers: {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            eids: JSON.stringify(neids),
            pids: JSON.stringify(requestedPids),
        }).toString(),
    });

    const values: Array<{ eid?: string; neid?: string; pid?: number | string; value: unknown }> =
        propsRes?.values ?? propsRes?.results ?? [];

    const byNeid: Record<string, Record<string, unknown>> = {};
    for (const neid of neids) byNeid[neid] = {};
    for (const v of values) {
        const neid = String(v.eid ?? v.neid ?? '');
        if (!neid || !byNeid[neid]) continue;
        const name = pidToName.get(String(v.pid)) ?? `pid_${v.pid}`;
        const existing = byNeid[neid][name];
        if (existing === undefined) {
            byNeid[neid][name] = v.value;
        } else if (Array.isArray(existing)) {
            (existing as unknown[]).push(v.value);
        } else {
            byNeid[neid][name] = [existing, v.value];
        }
    }

    return {
        properties: neids.map((neid) => ({ neid, values: byNeid[neid] ?? {} })),
    };
});
