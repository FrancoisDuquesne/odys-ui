<script setup lang="ts">
defineProps<{ message: string; unreachable: boolean; retrying?: boolean }>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <UDashboardPanel>
    <template #body>
      <div class="flex h-full items-center justify-center p-6">
        <div class="flex max-w-md flex-col items-center gap-4 text-center">
          <span class="flex size-12 items-center justify-center rounded-full bg-error/10 text-error">
            <UIcon :name="unreachable ? 'i-lucide-server-off' : 'i-lucide-circle-alert'" class="size-6" />
          </span>
          <div class="flex flex-col gap-1">
            <h1 class="text-lg font-semibold text-highlighted">
              {{ unreachable ? "Backend not reachable" : "Something went wrong" }}
            </h1>
            <p class="text-sm text-muted">{{ message }}</p>
          </div>
          <div
            v-if="unreachable"
            class="w-full rounded-md border border-default bg-muted px-3 py-2 text-left font-mono text-xs text-default"
          >
            <div class="text-dimmed"># start the backend</div>
            cd backend && uv run uvicorn --app-dir src odys_ui.main:app --reload
          </div>
          <UButton icon="i-lucide-refresh-cw" label="Try again" :loading="retrying" @click="$emit('retry')" />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
