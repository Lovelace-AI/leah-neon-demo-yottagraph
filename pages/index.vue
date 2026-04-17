<template>
    <div class="home-page">
        <div class="home-header">
            <PageHeader title="Neon + Elemental Knowledge Graph" icon="mdi-database-arrow-down" />
            <DbStatusBar v-model:status="dbStatus" @refresh="refreshStatus" />
        </div>

        <v-tabs
            v-model="activeTab"
            color="primary"
            density="comfortable"
            slider-color="primary"
            class="tabs-bar"
        >
            <v-tab value="import">
                <v-icon start>mdi-cloud-download-outline</v-icon>
                Import from API
            </v-tab>
            <v-tab value="query">
                <v-icon start>mdi-console</v-icon>
                Query Database
            </v-tab>
        </v-tabs>

        <v-window v-model="activeTab" class="home-window">
            <v-window-item value="import" class="home-pane">
                <ImportTab :db-connected="dbStatus?.connected === true" @imported="refreshStatus" />
            </v-window-item>
            <v-window-item value="query" class="home-pane">
                <QueryTab :db-connected="dbStatus?.connected === true" />
            </v-window-item>
        </v-window>
    </div>
</template>

<script setup lang="ts">
    interface DbStatus {
        configured: boolean;
        connected: boolean;
        rowCount?: number;
        message?: string;
    }

    const activeTab = ref<'import' | 'query'>('import');
    const dbStatus = ref<DbStatus | null>(null);

    async function refreshStatus() {
        try {
            dbStatus.value = await $fetch<DbStatus>('/api/db/status');
        } catch (err: any) {
            dbStatus.value = {
                configured: false,
                connected: false,
                message: err?.message ?? 'Failed to reach /api/db/status',
            };
        }
    }

    await refreshStatus();
</script>

<style scoped>
    .home-page {
        height: 100%;
        display: flex;
        flex-direction: column;
        padding: 16px 24px 0;
        gap: 12px;
        overflow: hidden;
    }

    .home-header {
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex-shrink: 0;
    }

    .tabs-bar {
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        flex-shrink: 0;
    }

    .home-window {
        flex: 1;
        min-height: 0;
        overflow: hidden;
    }

    .home-pane {
        height: 100%;
        overflow: hidden;
    }
</style>
