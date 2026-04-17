interface SearchRequest {
    query: string;
    maxResults?: number;
    flavors?: string[];
}

interface SearchMatch {
    neid: string;
    name: string;
    flavor?: string;
    score?: number;
}

/**
 * Proxy entity-name search to the Portal Gateway. Keeps the API key on
 * the server rather than exposing it via client-side `$fetch`.
 */
export default defineEventHandler(async (event) => {
    const body = await readBody<SearchRequest>(event);
    const query = (body?.query ?? '').trim();
    if (!query) {
        throw createError({ statusCode: 400, statusMessage: 'query is required' });
    }

    const { public: config } = useRuntimeConfig();
    const gatewayUrl = (config as any).gatewayUrl as string;
    const orgId = (config as any).tenantOrgId as string;
    const apiKey = (config as any).qsApiKey as string;

    if (!gatewayUrl || !orgId) {
        throw createError({ statusCode: 503, statusMessage: 'Gateway not configured' });
    }

    const queryObj: Record<string, unknown> = { queryId: 1, query };
    if (body?.flavors?.length) queryObj.flavors = body.flavors;

    const res = await $fetch<any>(`${gatewayUrl}/api/qs/${orgId}/entities/search`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(apiKey && { 'X-Api-Key': apiKey }),
        },
        body: {
            queries: [queryObj],
            maxResults: body?.maxResults ?? 10,
            includeNames: true,
        },
    });

    const matches: SearchMatch[] = (res?.results?.[0]?.matches ?? []).map((m: any) => ({
        neid: m.neid,
        name: m.name || m.neid,
        flavor: m.flavor ?? m.flavorName,
        score: m.score,
    }));

    return { matches };
});
