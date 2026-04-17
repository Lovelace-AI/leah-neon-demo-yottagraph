<template>
    <v-alert
        :type="alertType"
        density="compact"
        variant="tonal"
        border="start"
        :icon="icon"
        class="db-status"
    >
        <div class="status-row">
            <div class="status-text">
                <strong>{{ headline }}</strong>
                <span v-if="detail" class="status-detail">— {{ detail }}</span>
            </div>
            <v-btn
                size="x-small"
                variant="text"
                prepend-icon="mdi-refresh"
                @click="$emit('refresh')"
            >
                Refresh
            </v-btn>
        </div>
    </v-alert>
</template>

<script setup lang="ts">
    interface DbStatus {
        configured: boolean;
        connected: boolean;
        rowCount?: number;
        message?: string;
    }

    const props = defineProps<{ status: DbStatus | null }>();
    defineEmits<{ refresh: []; 'update:status': [value: DbStatus | null] }>();

    const alertType = computed<'success' | 'warning' | 'error' | 'info'>(() => {
        if (!props.status) return 'info';
        if (props.status.connected) return 'success';
        if (!props.status.configured) return 'warning';
        return 'error';
    });

    const icon = computed(() => {
        if (!props.status) return 'mdi-database-clock-outline';
        if (props.status.connected) return 'mdi-database-check-outline';
        return 'mdi-database-alert-outline';
    });

    const headline = computed(() => {
        if (!props.status) return 'Checking database…';
        if (props.status.connected) {
            const n = props.status.rowCount ?? 0;
            return `Neon Postgres connected · ${n} row${n === 1 ? '' : 's'} imported`;
        }
        if (!props.status.configured) return 'Neon database not configured';
        return 'Neon connection failed';
    });

    const detail = computed(() => props.status?.message ?? '');
</script>

<style scoped>
    .db-status {
        font-size: 0.85rem;
    }

    .status-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
    }

    .status-detail {
        color: inherit;
        opacity: 0.8;
        margin-left: 6px;
    }
</style>
