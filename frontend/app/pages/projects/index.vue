<script setup lang="ts">
const router = useRouter();
const route = useRoute();
const { projects, ensureLoaded } = useProjectsState();
const loadError = ref(false);
async function load() {
  loadError.value = false;
  try {
    await ensureLoaded();
  } catch {
    loadError.value = true;
  }
}
await load();

// A single project has nothing to choose from: go straight to its runs.
// "All projects" in the switcher links here with ?all=1 to opt out.
if (!loadError.value && projects.value.length === 1 && !route.query.all) {
  await navigateTo(`/p/${projects.value[0]!.id}/runs`, { replace: true });
}

const query = ref("");
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return projects.value;
  return projects.value.filter(
    (p) => p.name.toLowerCase().includes(q) || p.client.toLowerCase().includes(q),
  );
});

</script>

<template>
  <UDashboardPanel>
    <template #header>
      <PageHeader :crumbs="[{ label: 'Projects' }]">
        <template #meta><UBadge color="neutral" variant="subtle" size="sm" :label="String(projects.length)" /></template>
        <template #actions>
          <UInput v-model="query" icon="i-lucide-search" placeholder="Search projects or clients" aria-label="Search projects" class="w-64" />
        </template>
      </PageHeader>
    </template>

    <template #body>
      <ErrorState v-if="loadError" message="Could not load projects. Is the backend running?" @retry="load" />
      <EmptyState v-else-if="projects.length === 0" icon="i-lucide-layout-grid" title="No projects yet" description="Use the project switcher in the sidebar to create your first project." />
      <Panel v-else flush>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[560px] md:min-w-[820px] text-sm">
            <thead class="bg-ink-950/[0.05] dark:bg-black/25 text-left text-xs font-semibold text-muted">
              <tr>
                <th scope="col" class="px-4 py-2.5">Project / site</th>
                <th scope="col" class="px-3 py-2.5">Client</th>
                <th scope="col" class="hidden px-3 py-2.5 text-right md:table-cell">Portfolios</th>
                <th scope="col" class="hidden px-3 py-2.5 text-right md:table-cell">Scenario sets</th>
                <th scope="col" class="px-3 py-2.5 text-right">Runs</th>
                <th scope="col" class="px-3 py-2.5">Last run</th>
                <th scope="col" class="px-4 py-2.5 text-right">Last objective</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in filtered" :key="p.id" class="cursor-pointer border-t border-muted hover:bg-elevated/60" @click="router.push(`/p/${p.id}/runs`)">
                <td class="px-4 py-3">
                  <NuxtLink :to="`/p/${p.id}/runs`" class="font-semibold text-highlighted hover:text-primary" @click.stop>{{ p.name }}</NuxtLink>
                  <div class="text-xs text-muted">{{ p.asset_summary }}</div>
                </td>
                <td class="px-3 py-3 text-default">{{ p.client }}</td>
                <td class="hidden px-3 py-3 text-right font-mono md:table-cell">{{ p.portfolio_count }}</td>
                <td class="hidden px-3 py-3 text-right font-mono md:table-cell">{{ p.scenario_set_count }}</td>
                <td class="px-3 py-3 text-right font-mono">{{ p.run_count }}</td>
                <td class="px-3 py-3 text-default">{{ fmtDate(p.last_run_at) }}</td>
                <td class="px-4 py-3 text-right font-mono text-highlighted">{{ fmtMoney(p.last_objective_value) }}</td>
              </tr>
              <tr v-if="filtered.length === 0"><td colspan="5" class="px-4 py-10 text-center text-muted">No projects match “{{ query }}”.</td></tr>
            </tbody>
          </table>
        </div>
      </Panel>
    </template>
  </UDashboardPanel>
</template>
