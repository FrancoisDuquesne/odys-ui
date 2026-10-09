<script setup lang="ts">
import type { NuxtError } from "#app";

const props = defineProps<{ error: NuxtError }>();

const notFound = computed(() => props.error.statusCode === 404);
const unreachable = computed(() => isBackendUnreachable(props.error) && props.error.statusCode !== 404);
const title = computed(() =>
  notFound.value ? "Page not found" : unreachable.value ? "Backend not reachable" : "Something went wrong",
);
const message = computed(() =>
  notFound.value
    ? "That page doesn't exist or was moved."
    : unreachable.value
      ? BACKEND_UNREACHABLE
      : String(props.error.data?.detail ?? props.error.statusMessage ?? props.error.message ?? "An unexpected error occurred."),
);

const { refresh } = useProjectsState();
async function retry() {
  await refresh();
  await clearError({ redirect: "/" });
}
</script>

<template>
  <UApp>
    <div class="flex min-h-screen items-center justify-center bg-default p-6">
      <div class="flex max-w-md flex-col items-center gap-4 text-center">
        <span class="flex size-12 items-center justify-center rounded-full bg-error/10 text-error">
          <UIcon :name="notFound ? 'i-lucide-file-question' : unreachable ? 'i-lucide-server-off' : 'i-lucide-circle-alert'" class="size-6" />
        </span>
        <div class="flex flex-col gap-1">
          <p v-if="error.statusCode" class="font-mono text-xs text-dimmed">{{ error.statusCode }}</p>
          <h1 class="text-lg font-semibold text-highlighted">{{ title }}</h1>
          <p class="text-sm text-muted">{{ message }}</p>
        </div>
        <div v-if="unreachable" class="w-full rounded-md border border-default bg-muted px-3 py-2 text-left font-mono text-xs text-default">
          <div class="text-dimmed"># start the backend</div>
          cd backend && uv run uvicorn --app-dir src odys_ui.main:app --reload
        </div>
        <div class="flex gap-2">
          <UButton v-if="!notFound" icon="i-lucide-refresh-cw" label="Try again" @click="retry" />
          <UButton :color="notFound ? 'primary' : 'neutral'" :variant="notFound ? 'solid' : 'outline'" icon="i-lucide-house" label="Go home" @click="clearError({ redirect: '/' })" />
        </div>
      </div>
    </div>
  </UApp>
</template>
