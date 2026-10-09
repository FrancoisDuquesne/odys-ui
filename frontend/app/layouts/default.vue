<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";

const route = useRoute();
const { ensureLoaded, error: projectsError, refresh: refreshProjects } = useProjectsState();
const { currentProject, currentProjectId } = useCurrentProject();
const { listPortfolioVersions } = usePortfolio();

await ensureLoaded();

// While the project list is failing the page slot is replaced by <BackendDown>;
// a successful retry clears the error and the page mounts (and fetches) fresh.
const retrying = ref(false);
async function retry() {
  retrying.value = true;
  await refreshProjects();
  retrying.value = false;
}

const assetCount = ref(0);

watch(
  [currentProjectId, () => route.fullPath],
  async ([id]) => {
    if (!id) {
      assetCount.value = 0;
      return;
    }
    try {
      const versions = await listPortfolioVersions(id);
      assetCount.value = versions.at(-1)?.assets.length ?? 0;
    } catch {
      assetCount.value = 0;
    }
  },
  { immediate: true },
);

const path = computed(() => route.path);
const nav = computed<NavigationMenuItem[]>(() => {
  const base = `/p/${currentProjectId.value}`;
  // New run and Compare are actions reached from Runs, so they keep Runs highlighted.
  const runsActive = path.value.startsWith(`${base}/runs`) || path.value.startsWith(`${base}/compare`);
  return [
    { label: "Runs", icon: "i-lucide-history", to: `${base}/runs`, active: runsActive, badge: currentProject.value?.run_count ?? 0 },
    { label: "Portfolio", icon: "i-lucide-boxes", to: `${base}/portfolio`, active: path.value.endsWith("/portfolio"), badge: assetCount.value },
  ];
});
</script>

<template>
  <UDashboardGroup unit="px">
    <UDashboardSidebar
      collapsible
      :resizable="false"
      :default-size="240"
      :ui="{ header: 'border-b border-default', footer: 'border-t border-default' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink to="/" class="flex items-center gap-2 px-2" aria-label="odys home">
          <span class="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-inverted">
            <UIcon name="i-lucide-zap" class="size-4" />
          </span>
          <span v-if="!collapsed" class="text-base font-semibold tracking-tight text-highlighted">odys</span>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <div v-if="!collapsed" class="mb-2 flex px-0.5"><ProjectSwitcher /></div>
        <UNavigationMenu
          v-if="currentProjectId"
          :items="nav"
          :collapsed="collapsed"
          orientation="vertical"
          aria-label="Project"
          :ui="{ linkTrailingBadge: 'font-mono' }"
        />
      </template>

      <template #footer="{ collapsed }">
        <div class="flex w-full items-center gap-2.5 px-2 py-2">
          <UAvatar text="AK" size="sm" />
          <span v-if="!collapsed" class="flex min-w-0 flex-col leading-tight">
            <span class="truncate text-sm font-medium text-highlighted">Ana Kovač</span>
            <span class="truncate text-xs text-muted">{{ currentProject?.client ?? "Northbay Energy" }}</span>
          </span>
          <ClientOnly>
            <UColorModeButton v-if="!collapsed" class="ml-auto" color="neutral" variant="ghost" size="sm" />
          </ClientOnly>
        </div>
      </template>
    </UDashboardSidebar>

    <BackendDown
      v-if="projectsError"
      :message="projectsError.message"
      :unreachable="projectsError.unreachable"
      :retrying="retrying"
      @retry="retry"
    />
    <slot v-else />
  </UDashboardGroup>
</template>
