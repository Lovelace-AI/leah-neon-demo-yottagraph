<template>
    <div class="query-tab">
        <div class="query-layout">
            <aside class="schema-panel">
                <div class="panel-header">
                    <v-icon size="small" class="mr-2">mdi-table</v-icon>
                    <span>Tables</span>
                    <v-spacer />
                    <v-btn
                        size="x-small"
                        variant="text"
                        icon="mdi-refresh"
                        :disabled="loadingSchema"
                        @click="refreshSchema"
                    />
                </div>
                <div v-if="loadingSchema && !schema" class="panel-loading">
                    <v-progress-circular indeterminate size="20" />
                </div>
                <div v-else-if="!schema?.tables.length" class="panel-empty">
                    No tables yet. Import some entities first.
                </div>
                <div v-else class="panel-tables">
                    <v-expansion-panels
                        v-model="openPanels"
                        multiple
                        variant="accordion"
                        class="schema-accordion"
                    >
                        <v-expansion-panel
                            v-for="table in schema.tables"
                            :key="table.name"
                            :value="table.name"
                        >
                            <v-expansion-panel-title class="schema-title">
                                <v-icon size="x-small" class="mr-2">mdi-table-column</v-icon>
                                <span class="mono">{{ table.name }}</span>
                                <v-spacer />
                                <v-btn
                                    size="x-small"
                                    variant="text"
                                    icon="mdi-content-copy"
                                    @click.stop="insertSelect(table.name)"
                                />
                            </v-expansion-panel-title>
                            <v-expansion-panel-text>
                                <div
                                    v-for="col in table.columns"
                                    :key="col.name"
                                    class="column-row"
                                    @click="insertText(col.name)"
                                >
                                    <span class="mono col-name">{{ col.name }}</span>
                                    <span class="col-type">{{ col.type }}</span>
                                </div>
                            </v-expansion-panel-text>
                        </v-expansion-panel>
                    </v-expansion-panels>
                </div>

                <div class="panel-header examples-header">
                    <v-icon size="small" class="mr-2">mdi-lightbulb-outline</v-icon>
                    <span>Examples</span>
                </div>
                <div class="examples">
                    <div
                        v-for="ex in examples"
                        :key="ex.label"
                        class="example-row"
                        @click="sql = ex.sql"
                    >
                        <div class="example-label">{{ ex.label }}</div>
                        <div class="example-desc">{{ ex.desc }}</div>
                    </div>
                </div>
            </aside>

            <main class="query-main">
                <div class="editor-wrap">
                    <v-textarea
                        v-model="sql"
                        variant="outlined"
                        density="compact"
                        hide-details
                        :rows="8"
                        :disabled="!dbConnected"
                        :placeholder="defaultPlaceholder"
                        class="sql-editor mono"
                        @keydown.ctrl.enter.prevent="runQuery"
                        @keydown.meta.enter.prevent="runQuery"
                    />
                    <div class="editor-actions">
                        <div class="kbd-hint">
                            Press
                            <kbd>⌘</kbd>
                            /<kbd>Ctrl</kbd>
                            +
                            <kbd>↵</kbd>
                            to run
                        </div>
                        <v-spacer />
                        <v-btn
                            variant="text"
                            size="small"
                            prepend-icon="mdi-close"
                            :disabled="!sql"
                            @click="sql = ''"
                        >
                            Clear
                        </v-btn>
                        <v-btn
                            color="primary"
                            :loading="running"
                            :disabled="!sql || !dbConnected"
                            prepend-icon="mdi-play"
                            @click="runQuery"
                        >
                            Run
                        </v-btn>
                    </div>
                </div>

                <div class="results-wrap">
                    <v-alert
                        v-if="!dbConnected"
                        type="warning"
                        variant="tonal"
                        density="compact"
                        icon="mdi-database-off-outline"
                    >
                        Database not connected. Push to main to test with the deployed Neon
                        database.
                    </v-alert>

                    <v-alert
                        v-else-if="queryError"
                        type="error"
                        variant="tonal"
                        density="compact"
                        icon="mdi-alert-circle-outline"
                    >
                        <div class="mono">{{ queryError }}</div>
                    </v-alert>

                    <div v-else-if="result" class="result-inner">
                        <div class="result-header">
                            <v-chip size="small" variant="tonal" color="success">
                                <v-icon start size="x-small">mdi-check-circle-outline</v-icon>
                                {{ result.rowCount }} row{{ result.rowCount === 1 ? '' : 's' }}
                            </v-chip>
                            <v-chip size="small" variant="tonal" color="info">
                                <v-icon start size="x-small">mdi-timer-outline</v-icon>
                                {{ result.elapsedMs }} ms
                            </v-chip>
                            <v-spacer />
                            <v-btn
                                size="x-small"
                                variant="text"
                                prepend-icon="mdi-download"
                                :disabled="!result.rows.length"
                                @click="downloadCsv"
                            >
                                CSV
                            </v-btn>
                        </div>
                        <div class="table-scroll">
                            <table v-if="result.rows.length" class="results-table">
                                <thead>
                                    <tr>
                                        <th v-for="f in result.fields" :key="f.name">
                                            {{ f.name }}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="(row, i) in result.rows" :key="i">
                                        <td v-for="f in result.fields" :key="f.name">
                                            <span
                                                class="cell-value"
                                                :title="formatCell(row[f.name])"
                                            >
                                                {{ formatCell(row[f.name]) }}
                                            </span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                            <div v-else class="empty-results">Query succeeded with no rows.</div>
                        </div>
                    </div>

                    <div v-else class="empty-state">
                        <v-icon size="48" color="grey">mdi-console</v-icon>
                        <div class="empty-title">Write a query to get started</div>
                        <div class="empty-hint">
                            Only read-only statements (SELECT, WITH, EXPLAIN) are allowed. Click a
                            column or example on the left to insert it.
                        </div>
                    </div>
                </div>
            </main>
        </div>
    </div>
</template>

<script setup lang="ts">
    interface SchemaTable {
        name: string;
        columns: Array<{ name: string; type: string }>;
    }

    interface QueryField {
        name: string;
        dataTypeID?: number;
    }

    interface QueryResultOk {
        ok: true;
        rowCount: number;
        elapsedMs: number;
        fields: QueryField[];
        rows: Record<string, unknown>[];
    }

    interface QueryResultErr {
        ok: false;
        error: string;
        elapsedMs: number;
    }

    const props = defineProps<{ dbConnected: boolean }>();

    // A friendly default: show every entity with a few of its most useful
    // properties pulled out of the JSONB column. The COALESCE lines fall
    // back to '—' so nulls don't look confusing, and the output fits on
    // one screen.
    const defaultSql = `SELECT
    name,
    flavor AS type,
    COALESCE(properties->>'country', '—')  AS country,
    COALESCE(properties->>'industry', '—') AS industry,
    COALESCE(properties->>'ticker', '—')   AS ticker,
    imported_at
FROM imported_entities
ORDER BY imported_at DESC;`;

    const sql = ref(defaultSql);
    const running = ref(false);
    const result = ref<QueryResultOk | null>(null);
    const queryError = ref<string | null>(null);

    const schema = ref<{ tables: SchemaTable[] } | null>(null);
    const loadingSchema = ref(false);
    const openPanels = ref<string[]>(['imported_entities']);

    const defaultPlaceholder = `SELECT * FROM imported_entities LIMIT 10;`;

    // Each example is small, self-contained, and demonstrates one SQL
    // concept. The intent is that someone new to SQL can read them in
    // order and understand what's possible.
    const examples = [
        {
            label: 'All imports (flat)',
            desc: 'Pull a few properties out of the JSONB column',
            sql: `SELECT
    name,
    flavor AS type,
    COALESCE(properties->>'country', '—')  AS country,
    COALESCE(properties->>'industry', '—') AS industry,
    imported_at
FROM imported_entities
ORDER BY imported_at DESC;`,
        },
        {
            label: 'Count by type',
            desc: 'How many of each entity type have you imported?',
            sql: `SELECT
    flavor AS type,
    COUNT(*) AS n
FROM imported_entities
GROUP BY flavor
ORDER BY n DESC;`,
        },
        {
            label: 'Companies by country',
            desc: 'Filter by type, group by an extracted property',
            sql: `SELECT
    COALESCE(properties->>'country', 'unknown') AS country,
    COUNT(*) AS companies
FROM imported_entities
WHERE flavor = 'organization'
GROUP BY country
ORDER BY companies DESC;`,
        },
        {
            label: 'Full property payload',
            desc: 'See everything we stored for each entity',
            sql: `SELECT name, flavor, properties
FROM imported_entities
ORDER BY name;`,
        },
        {
            label: 'What properties exist?',
            desc: 'Every JSON key that appears across all entities',
            sql: `SELECT
    jsonb_object_keys(properties) AS property,
    COUNT(*) AS entities_with_it
FROM imported_entities
GROUP BY property
ORDER BY entities_with_it DESC, property;`,
        },
        {
            label: 'Search by name',
            desc: 'Case-insensitive substring match with ILIKE',
            sql: `SELECT name, flavor, properties->>'ticker' AS ticker
FROM imported_entities
WHERE name ILIKE '%bank%'
ORDER BY name;`,
        },
        {
            label: 'Imports per day',
            desc: 'Bucket by day to see your activity over time',
            sql: `SELECT
    DATE_TRUNC('day', imported_at)::date AS day,
    COUNT(*) AS imports
FROM imported_entities
GROUP BY day
ORDER BY day DESC;`,
        },
    ];

    async function refreshSchema() {
        if (!props.dbConnected) {
            schema.value = { tables: [] };
            return;
        }
        loadingSchema.value = true;
        try {
            schema.value = await $fetch<{ tables: SchemaTable[] }>('/api/db/schema');
        } catch {
            schema.value = { tables: [] };
        } finally {
            loadingSchema.value = false;
        }
    }

    async function runQuery() {
        if (!sql.value || !props.dbConnected) return;
        running.value = true;
        queryError.value = null;
        try {
            const res = await $fetch<QueryResultOk | QueryResultErr>('/api/db/query', {
                method: 'POST',
                body: { sql: sql.value },
            });
            if (res.ok) {
                result.value = res;
            } else {
                queryError.value = res.error;
                result.value = null;
            }
        } catch (err: any) {
            queryError.value = err?.data?.statusMessage ?? err?.message ?? 'Query failed';
            result.value = null;
        } finally {
            running.value = false;
        }
    }

    function insertText(text: string) {
        sql.value = (sql.value ?? '') + text;
    }

    function insertSelect(table: string) {
        sql.value = `SELECT * FROM ${table} LIMIT 50;`;
    }

    function formatCell(v: unknown): string {
        if (v === null || v === undefined) return '∅';
        if (typeof v === 'string') return v;
        if (v instanceof Date) return v.toISOString();
        if (typeof v === 'object') {
            try {
                return JSON.stringify(v);
            } catch {
                return String(v);
            }
        }
        return String(v);
    }

    function downloadCsv() {
        if (!result.value?.rows.length) return;
        const fields = result.value.fields.map((f) => f.name);
        const escape = (v: unknown) => {
            const s = formatCell(v);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const lines = [fields.join(',')];
        for (const row of result.value.rows) {
            lines.push(fields.map((f) => escape(row[f])).join(','));
        }
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `query-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    watch(
        () => props.dbConnected,
        (v) => {
            if (v) refreshSchema();
        },
        { immediate: true }
    );
</script>

<style scoped>
    .query-tab {
        height: 100%;
        padding: 12px 0;
        display: flex;
        min-height: 0;
    }

    .query-layout {
        display: grid;
        grid-template-columns: 260px 1fr;
        gap: 12px;
        width: 100%;
        min-height: 0;
    }

    .schema-panel {
        display: flex;
        flex-direction: column;
        background: var(--lv-surface, rgba(255, 255, 255, 0.03));
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        overflow: hidden;
        min-height: 0;
    }

    .panel-header {
        display: flex;
        align-items: center;
        padding: 10px 12px;
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--lv-silver, rgba(255, 255, 255, 0.65));
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .examples-header {
        border-top: 1px solid rgba(255, 255, 255, 0.08);
    }

    .panel-loading,
    .panel-empty {
        padding: 16px;
        text-align: center;
        color: var(--lv-silver, rgba(255, 255, 255, 0.65));
        font-size: 0.85rem;
    }

    .panel-tables {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
    }

    .schema-accordion :deep(.v-expansion-panel) {
        background: transparent;
    }

    .schema-title {
        min-height: 36px !important;
        padding: 6px 12px !important;
        font-size: 0.8rem;
    }

    .column-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 8px;
        font-size: 0.75rem;
        cursor: pointer;
        border-radius: 4px;
    }

    .column-row:hover {
        background: rgba(255, 255, 255, 0.05);
    }

    .col-name {
        color: rgba(255, 255, 255, 0.85);
    }

    .col-type {
        color: var(--lv-silver, rgba(255, 255, 255, 0.55));
        font-size: 0.7rem;
        text-transform: uppercase;
    }

    .examples {
        display: flex;
        flex-direction: column;
        padding: 6px 8px 10px;
        gap: 2px;
    }

    .example-row {
        padding: 6px 8px;
        cursor: pointer;
        border-radius: 4px;
    }

    .example-row:hover {
        background: rgba(255, 255, 255, 0.05);
    }

    .example-label {
        font-size: 0.82rem;
        color: rgba(255, 255, 255, 0.88);
        font-weight: 500;
    }

    .example-desc {
        font-size: 0.72rem;
        color: var(--lv-silver, rgba(255, 255, 255, 0.6));
    }

    .query-main {
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-height: 0;
    }

    .editor-wrap {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .sql-editor :deep(textarea) {
        font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace) !important;
        font-size: 0.85rem !important;
        line-height: 1.5;
    }

    .editor-actions {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .kbd-hint {
        font-size: 0.75rem;
        color: var(--lv-silver, rgba(255, 255, 255, 0.55));
    }

    kbd {
        display: inline-block;
        padding: 1px 5px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 3px;
        font-family: var(--font-mono, monospace);
        font-size: 0.72rem;
        margin: 0 1px;
    }

    .results-wrap {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
    }

    .result-inner {
        display: flex;
        flex-direction: column;
        min-height: 0;
        flex: 1;
        gap: 8px;
    }

    .result-header {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
    }

    .table-scroll {
        flex: 1;
        min-height: 0;
        overflow: auto;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
    }

    .results-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.82rem;
    }

    .results-table th,
    .results-table td {
        padding: 6px 10px;
        text-align: left;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        max-width: 360px;
    }

    .results-table th {
        background: rgba(255, 255, 255, 0.04);
        font-weight: 500;
        text-transform: uppercase;
        font-size: 0.7rem;
        letter-spacing: 0.06em;
        color: var(--lv-silver, rgba(255, 255, 255, 0.7));
        position: sticky;
        top: 0;
        z-index: 1;
    }

    .results-table tbody tr:hover {
        background: rgba(255, 255, 255, 0.03);
    }

    .cell-value {
        display: inline-block;
        max-width: 360px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        vertical-align: bottom;
        font-family: var(--font-mono, ui-monospace, monospace);
    }

    .empty-results {
        padding: 32px;
        text-align: center;
        color: var(--lv-silver, rgba(255, 255, 255, 0.55));
    }

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        flex: 1;
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
        max-width: 460px;
    }

    .mono {
        font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    }
</style>
