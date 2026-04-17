<template>
    <div class="import-tab">
        <v-card class="search-card" variant="tonal">
            <v-card-text class="pa-4">
                <div class="search-row">
                    <v-text-field
                        v-model="query"
                        label="Search the Knowledge Graph"
                        placeholder="e.g. Apple, Microsoft, JPMorgan, Joe Biden…"
                        prepend-inner-icon="mdi-magnify"
                        variant="outlined"
                        density="comfortable"
                        hide-details
                        clearable
                        :disabled="searching"
                        @keydown.enter="runSearch"
                    />
                    <v-btn
                        color="primary"
                        :loading="searching"
                        :disabled="!query || !query.trim()"
                        prepend-icon="mdi-magnify"
                        @click="runSearch"
                    >
                        Search
                    </v-btn>
                    <v-btn
                        :disabled="!selectedNeids.size || !dbConnected || importing"
                        :loading="importing"
                        color="success"
                        prepend-icon="mdi-database-arrow-down"
                        @click="runImport"
                    >
                        Import {{ selectedNeids.size || '' }}
                    </v-btn>
                </div>

                <div class="search-hint">
                    <v-icon size="x-small" class="mr-1">mdi-information-outline</v-icon>
                    Results come from the Lovelace Elemental knowledge graph. Select rows, then
                    "Import" to fetch full property data and write to Neon Postgres.
                </div>
            </v-card-text>
        </v-card>

        <v-alert
            v-if="searchError"
            type="error"
            density="compact"
            variant="tonal"
            class="mt-2"
            closable
            @click:close="searchError = null"
        >
            {{ searchError }}
        </v-alert>

        <v-alert
            v-if="importResult"
            :type="importResult.errors.length ? 'warning' : 'success'"
            density="compact"
            variant="tonal"
            class="mt-2"
            closable
            @click:close="importResult = null"
        >
            Imported <strong>{{ importResult.inserted }}</strong> new and updated
            <strong>{{ importResult.updated }}</strong> existing entities.
            <span v-if="importResult.errors.length">
                {{ importResult.errors.length }} failed.
            </span>
        </v-alert>

        <div class="results-scroll">
            <div v-if="!results.length && !searching" class="empty-state">
                <v-icon size="48" color="grey">mdi-magnify</v-icon>
                <div class="empty-title">
                    {{ hasSearched ? 'No matches' : 'Search to get started' }}
                </div>
                <div class="empty-hint">
                    Try common company names like "Microsoft", "Apple Inc", or "JPMorgan Chase".
                </div>
            </div>

            <div v-else class="results-grid">
                <v-card
                    v-for="r in results"
                    :key="r.neid"
                    :variant="selectedNeids.has(r.neid) ? 'tonal' : 'outlined'"
                    :color="selectedNeids.has(r.neid) ? 'primary' : undefined"
                    class="result-card"
                    @click="toggleSelected(r.neid)"
                >
                    <v-card-text class="pa-3">
                        <div class="result-header">
                            <v-checkbox
                                :model-value="selectedNeids.has(r.neid)"
                                hide-details
                                density="compact"
                                class="result-checkbox"
                                @click.stop
                                @update:model-value="toggleSelected(r.neid)"
                            />
                            <div class="result-title">
                                <div class="result-name">{{ r.name }}</div>
                                <div class="result-meta">
                                    <v-chip
                                        v-if="r.flavor"
                                        size="x-small"
                                        variant="flat"
                                        color="secondary"
                                    >
                                        {{ r.flavor }}
                                    </v-chip>
                                    <span v-if="r.score !== undefined" class="result-score">
                                        score {{ r.score.toFixed(2) }}
                                    </span>
                                    <span class="result-neid">{{ r.neid }}</span>
                                </div>
                            </div>
                        </div>
                    </v-card-text>
                </v-card>
            </div>
        </div>

        <v-overlay v-model="importing" class="align-center justify-center" persistent>
            <div class="overlay-content">
                <v-progress-circular indeterminate color="primary" size="48" />
                <div class="overlay-text">{{ importStatus || 'Importing…' }}</div>
            </div>
        </v-overlay>
    </div>
</template>

<script setup lang="ts">
    interface SearchMatch {
        neid: string;
        name: string;
        flavor?: string;
        score?: number;
    }

    interface ImportError {
        neid: string;
        message: string;
    }

    interface ImportResult {
        inserted: number;
        updated: number;
        errors: ImportError[];
    }

    const props = defineProps<{ dbConnected: boolean }>();
    const emit = defineEmits<{ imported: [] }>();

    const query = ref('');
    const results = ref<SearchMatch[]>([]);
    const selectedNeids = ref<Set<string>>(new Set());
    const searching = ref(false);
    const importing = ref(false);
    const importStatus = ref<string>('');
    const hasSearched = ref(false);
    const searchError = ref<string | null>(null);
    const importResult = ref<ImportResult | null>(null);

    function toggleSelected(neid: string) {
        const next = new Set(selectedNeids.value);
        if (next.has(neid)) next.delete(neid);
        else next.add(neid);
        selectedNeids.value = next;
    }

    async function runSearch() {
        const q = query.value?.trim();
        if (!q) return;
        searching.value = true;
        searchError.value = null;
        hasSearched.value = true;
        try {
            const res = await $fetch<{ matches: SearchMatch[] }>('/api/elemental/search', {
                method: 'POST',
                body: { query: q, maxResults: 25 },
            });
            results.value = res.matches ?? [];
            selectedNeids.value = new Set();
        } catch (err: any) {
            searchError.value = err?.data?.statusMessage ?? err?.message ?? 'Search failed';
            results.value = [];
        } finally {
            searching.value = false;
        }
    }

    async function runImport() {
        if (!props.dbConnected) {
            searchError.value = 'Database is not connected. Deploy to test with Neon.';
            return;
        }
        const neids = [...selectedNeids.value];
        if (neids.length === 0) return;

        const selected = results.value.filter((r) => selectedNeids.value.has(r.neid));

        importing.value = true;
        importStatus.value = `Fetching properties for ${neids.length} entit${neids.length === 1 ? 'y' : 'ies'}…`;
        importResult.value = null;

        try {
            const propsRes = await $fetch<{
                properties: Array<{ neid: string; values: Record<string, unknown> }>;
            }>('/api/elemental/properties', {
                method: 'POST',
                body: { neids },
            });

            const propsByNeid = new Map(propsRes.properties.map((p) => [p.neid, p.values]));

            importStatus.value = 'Writing to Neon Postgres…';
            const payload = {
                query: query.value?.trim() ?? null,
                entities: selected.map((r) => ({
                    neid: r.neid,
                    name: r.name,
                    flavor: r.flavor,
                    properties: propsByNeid.get(r.neid) ?? {},
                })),
            };

            const result = await $fetch<ImportResult>('/api/db/import', {
                method: 'POST',
                body: payload,
            });

            importResult.value = result;
            selectedNeids.value = new Set();
            emit('imported');
        } catch (err: any) {
            searchError.value = err?.data?.statusMessage ?? err?.message ?? 'Import failed';
        } finally {
            importing.value = false;
            importStatus.value = '';
        }
    }
</script>

<style scoped>
    .import-tab {
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px 0;
        min-height: 0;
    }

    .search-card {
        flex-shrink: 0;
    }

    .search-row {
        display: flex;
        gap: 12px;
        align-items: center;
    }

    .search-row :deep(.v-field) {
        flex: 1;
    }

    .search-hint {
        font-size: 0.78rem;
        color: var(--lv-silver, rgba(255, 255, 255, 0.65));
        margin-top: 10px;
        display: flex;
        align-items: center;
    }

    .results-scroll {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 4px 2px 24px;
    }

    .results-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 10px;
    }

    .result-card {
        cursor: pointer;
        transition: transform 0.08s ease;
    }

    .result-card:hover {
        transform: translateY(-1px);
    }

    .result-header {
        display: flex;
        align-items: flex-start;
        gap: 6px;
    }

    .result-checkbox {
        margin-top: -4px;
        flex-shrink: 0;
    }

    .result-title {
        flex: 1;
        min-width: 0;
    }

    .result-name {
        font-weight: 500;
        font-size: 0.95rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .result-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 4px;
        font-size: 0.72rem;
        color: var(--lv-silver, rgba(255, 255, 255, 0.65));
        flex-wrap: wrap;
    }

    .result-neid {
        font-family: var(--font-mono, monospace);
        font-size: 0.7rem;
        opacity: 0.6;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 100%;
    }

    .result-score {
        font-family: var(--font-mono, monospace);
    }

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 24px;
        text-align: center;
        color: var(--lv-silver, rgba(255, 255, 255, 0.65));
    }

    .empty-title {
        font-size: 1.1rem;
        margin-top: 12px;
        color: rgba(255, 255, 255, 0.85);
    }

    .empty-hint {
        font-size: 0.85rem;
        margin-top: 6px;
        max-width: 420px;
    }

    .overlay-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        padding: 24px 32px;
        background: var(--lv-surface, #1a1a1a);
        border-radius: 8px;
    }

    .overlay-text {
        font-size: 0.9rem;
        color: rgba(255, 255, 255, 0.85);
    }
</style>
