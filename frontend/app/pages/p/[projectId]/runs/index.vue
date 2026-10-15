<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { PortfolioVersion, Run, ScenarioSet } from "~/types";

const route = useRoute();
const router = useRouter();
const projectId = computed(() => Number(route.params.projectId));
const toast = useToast();

const { currentProject } = useCurrentProject();
const { listRuns, uploadActuals } = useRuns();
const { listPortfolioVersions } = usePortfolio();
const { listScenarioSets } = useScenarioSets();

const runs = ref<Run[]>([]);
const portfolioVersions = ref<PortfolioVersion[]>([]);
const scenarioSets = ref<ScenarioSet[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const actuals = ref<{ series: number[]; mae: number; filename: string; runId: number } | null>(null);
const uploadingActuals = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    [runs.value, portfolioVersions.value, scenarioSets.value] = await Promise.all([
      listRuns(projectId.value),
      listPortfolioVersions(projectId.value),
      listScenarioSets(projectId.value),
    ]);
  } catch (e: any) {
    loadError.value = e?.data?.detail ? String(e.data.detail) : "Could not load runs.";
  } finally {
    loading.value = false;
  }
}
await load();

const portfolioById = computed(() => new Map(portfolioVersions.value.map((p) => [p.id, p])));
const scenarioSetById = computed(() => new Map(scenarioSets.value.map((s) => [s.id, s])));

const portfolioLabel = (run: Run) => {
  const pv = portfolioById.value.get(run.portfolio_version_id);
  return pv ? `${pv.name} v${pv.version}` : "—";
};
const scenarioLabel = (run: Run) => {
  const ss = scenarioSetById.value.get(run.scenario_set_version_id);
  return ss ? `${ss.name} v${ss.version}` : "—";
};

function riskLabel(run: Run) {
  const ss = scenarioSetById.value.get(run.scenario_set_version_id);
  if (!ss) return "";
  if (ss.mode === "deterministic") return "Deterministic";
  if (run.objective.cvar) return `${ss.scenarios.length} scenarios · CVaR ${run.objective.cvar.weight} @ ${fmtPct(run.objective.cvar.confidence_level)}`;
  return `${ss.scenarios.length} scenarios · risk-neutral`;
}

// ---- filter + sort ---------------------------------------------------------
const statusFilter = ref<"all" | "ok" | "failed">("all");
const sortKey = ref<"created" | "objective" | "solve">("created");
const sortDir = ref<"asc" | "desc">("desc");

function toggleSort(key: typeof sortKey.value) {
  if (sortKey.value === key) sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  else {
    sortKey.value = key;
    sortDir.value = "desc";
  }
}

const statusItems = computed(() => [
  { value: "all", label: "All", count: runs.value.length },
  { value: "ok", label: "Solved", count: runs.value.filter((r) => hasResults(r.status)).length },
  { value: "failed", label: "Failed", count: runs.value.filter((r) => !hasResults(r.status)).length },
]);

const visibleRuns = computed(() => {
  const list = runs.value.filter((r) => statusFilter.value === "all" || (statusFilter.value === "ok") === hasResults(r.status));
  const val = (r: Run) =>
    sortKey.value === "created" ? r.id : sortKey.value === "objective" ? (r.objective_value ?? -Infinity) : (r.solve_time_seconds ?? -1);
  const dir = sortDir.value === "asc" ? 1 : -1;
  return [...list].sort((a, b) => (val(a) - val(b)) * dir);
});

function ariaSort(key: typeof sortKey.value) {
  return sortKey.value === key ? (sortDir.value === "asc" ? "ascending" : "descending") : "none";
}

function menuItems(run: Run): DropdownMenuItem[][] {
  return [
    [{ label: run.display_id, type: "label" }],
    [
      { label: "Open results", icon: "i-lucide-chart-area", onSelect: () => router.push(`/p/${projectId.value}/runs/${run.id}`) },
      {
        label: "Compare with…",
        icon: "i-lucide-git-compare",
        disabled: !hasResults(run.status),
        onSelect: () => router.push(`/p/${projectId.value}/compare?a=${run.id}`),
      },
      { label: "Re-run configuration", icon: "i-lucide-rotate-cw", onSelect: () => router.push(`/p/${projectId.value}/runs/new?from=${run.id}`) },
    ],
    [{ label: "Download results (CSV)", icon: "i-lucide-download", disabled: !run.results, onSelect: () => downloadCsv(run) }],
  ];
}

function downloadCsv(run: Run) {
  if (!run.results) return;
  const first = run.results.scenarios[0]?.name;
  const scen = first ? run.results.by_scenario[first] : null;
  if (!scen) return;
  const rows: string[] = [];
  const genNames = Object.keys(scen.generators);
  const stoNames = Object.keys(scen.storages);
  const mktNames = Object.keys(scen.markets);
  const header = [
    "step",
    ...genNames.map((n) => `${n}_power`),
    ...stoNames.map((n) => `${n}_net_power`),
    ...stoNames.map((n) => `${n}_soc`),
    ...mktNames.map((n) => `${n}_buy`),
    ...mktNames.map((n) => `${n}_sell`),
  ];
  rows.push(header.join(","));
  for (let t = 0; t < run.results.number_of_steps; t++) {
    const row = [
      String(t),
      ...genNames.map((n) => scen.generators[n].power[t]),
      ...stoNames.map((n) => scen.storages[n].net_power[t]),
      ...stoNames.map((n) => scen.storages[n].soc[t]),
      ...mktNames.map((n) => scen.markets[n].buy_volume[t]),
      ...mktNames.map((n) => scen.markets[n].sell_volume[t]),
    ];
    rows.push(row.join(","));
  }
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${run.display_id}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- profit trend + what changed ----------------------------------------------
const chronological = computed(() => [...runs.value].sort((a, b) => a.id - b.id));

const trend = computed(() =>
  chronological.value
    .filter((r) => r.objective_value !== null)
    .slice(-8)
    .map((r) => ({
      id: r.display_id,
      label: `${portfolioLabel(r)} · ${scenarioLabel(r)}`,
      value: r.objective_value ?? 0,
    })),
);
const trendSummary = computed(() => {
  const t = trend.value;
  if (t.length === 0) return "";
  if (t.length === 1) return "Only one solved run so far.";
  const first = t[0]!.value;
  if (t.every((p) => Math.abs(p.value - first) < 0.5)) return `All ${t.length} runs reached the same objective. Dashed line = baseline.`;
  const best = t.reduce((m, p) => (p.value > m.value ? p : m));
  return `Best: ${best.id} at ${fmtMoney(best.value)}. Dashed line = baseline (first run).`;
});

// Each run is compared with the run created just before it.
const previousById = computed(() => {
  const m = new Map<number, Run>();
  chronological.value.forEach((r, i) => {
    if (i > 0) m.set(r.id, chronological.value[i - 1]!);
  });
  return m;
});

function deltaFor(run: Run): { kind: "baseline" | "same" | "up" | "down"; text: string } | null {
  if (run.objective_value === null) return null;
  const prev = previousById.value.get(run.id);
  if (!prev) return { kind: "baseline", text: "baseline" };
  if (prev.objective_value === null) return null;
  const d = run.objective_value - prev.objective_value;
  if (Math.abs(d) < 0.5) return { kind: "same", text: "no change" };
  return { kind: d > 0 ? "up" : "down", text: `${fmtMoney(d, { plus: true })} vs ${prev.display_id}` };
}
const deltaClass = (k: string) => (k === "up" ? "text-success" : k === "down" ? "text-error" : "text-muted");

function changesFor(run: Run): string[] | null {
  const prev = previousById.value.get(run.id);
  if (!prev) return null;
  const out: string[] = [];
  const ver = (id: number, map: Map<number, { version: number }>) => `v${map.get(id)?.version ?? "?"}`;
  if (run.portfolio_version_id !== prev.portfolio_version_id)
    out.push(`Portfolio ${ver(prev.portfolio_version_id, portfolioById.value)} → ${ver(run.portfolio_version_id, portfolioById.value)}`);
  if (run.scenario_set_version_id !== prev.scenario_set_version_id)
    out.push(`Scenarios ${ver(prev.scenario_set_version_id, scenarioSetById.value)} → ${ver(run.scenario_set_version_id, scenarioSetById.value)}`);
  const w = (r: Run) => r.objective.cvar?.weight ?? 0;
  if (w(run) !== w(prev)) out.push(`CVaR weight ${w(prev)} → ${w(run)}`);
  if (run.solver.solver_name !== prev.solver.solver_name) out.push(`Solver ${prev.solver.solver_name} → ${run.solver.solver_name}`);
  return out;
}

// ---- plan vs actual -------------------------------------------------------------
const latestRun = computed(() => [...runs.value].sort((a, b) => b.id - a.id).find((r) => r.results) ?? null);
const latestStepHours = computed(() => scenarioSetById.value.get(latestRun.value?.scenario_set_version_id ?? -1)?.timestep_hours ?? 1);

const plannedNetPosition = computed(() => {
  const run = latestRun.value;
  if (!run?.results) return [];
  const first = run.results.scenarios[0]?.name;
  const scen = first ? run.results.by_scenario[first] : null;
  if (!scen) return [];
  const n = run.results.number_of_steps;
  const out: number[] = new Array(n).fill(0);
  for (const m of Object.values(scen.markets)) {
    for (let t = 0; t < n; t++) out[t] += m.sell_volume[t] - m.buy_volume[t];
  }
  return out;
});

async function onActualsFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !latestRun.value) return;
  uploadingActuals.value = true;
  try {
    const res = await uploadActuals(latestRun.value.id, file);
    actuals.value = { ...(res as any), runId: latestRun.value.id };
    toast.add({ title: "Actuals loaded", description: file.name, color: "success", icon: "i-lucide-circle-check" });
  } catch (err: any) {
    toast.add({
      title: "Could not read actuals",
      description: err?.data?.detail ? String(err.data.detail) : "Expected a CSV with one value per timestep.",
      color: "error",
    });
  } finally {
    uploadingActuals.value = false;
    input.value = "";
  }
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <PageHeader :crumbs="[{ label: currentProject?.name ?? 'Project', to: `/p/${projectId}/runs` }, { label: 'Runs' }]">
        <template #actions>
          <UButton color="neutral" variant="outline" icon="i-lucide-git-compare" :to="`/p/${projectId}/compare`" :disabled="runs.filter((r) => hasResults(r.status)).length < 2" label="Compare" />
          <UButton icon="i-lucide-play" :to="`/p/${projectId}/runs/new`" label="New run" />
        </template>
      </PageHeader>
    </template>

    <template #body>
      <PageSkeleton v-if="loading" />
      <ErrorState v-else-if="loadError" :message="loadError" @retry="load" />
      <div v-else class="flex flex-col gap-5">
        <div class="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-4">
          <Panel title="Objective over time" :description="trendSummary || 'Higher is better. Losses plot below zero.'">
            <ClientOnly v-if="trend.length">
              <RunTrendChart :points="trend" />
            </ClientOnly>
            <EmptyState v-else icon="i-lucide-chart-column" title="No runs yet" description="Run an optimization to start tracking results over time." />
          </Panel>

          <Panel
            title="Plan vs. actual"
            :description="latestRun ? `${latestRun.display_id} · planned net market position (sell − buy), MW` : 'Planned net market position'"
          >
            <template #actions>
              <span v-if="actuals" class="text-xs text-muted">
                MAE <b class="font-mono text-highlighted">{{ actuals.mae.toFixed(1) }} MW</b>
              </span>
              <template v-if="latestRun">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-upload"
                  :loading="uploadingActuals"
                  :label="actuals ? 'Replace CSV' : 'Upload actuals CSV'"
                  @click="fileInput?.click()"
                />
                <input ref="fileInput" type="file" accept=".csv" class="sr-only" tabindex="-1" @change="onActualsFile" />
              </template>
            </template>
            <ClientOnly v-if="plannedNetPosition.length">
              <PlanActualChart :planned="plannedNetPosition" :actual="actuals?.series ?? null" :step-hours="latestStepHours" />
            </ClientOnly>
            <EmptyState v-else icon="i-lucide-activity" title="No planned dispatch yet" description="A solved run is needed to compare against metered values." />
            <template #footer>Actuals are user-uploaded CSVs matched to a stored run. odys has no telemetry — this is a platform-level comparison.</template>
          </Panel>
        </div>

        <Panel flush>
          <div class="flex flex-wrap items-center gap-3 border-b border-muted px-4 py-3">
            <h2 class="text-sm font-semibold text-highlighted">Run history</h2>
            <SegmentedControl v-model="statusFilter" label="Filter runs by outcome" :items="statusItems" />
          </div>
          <div v-if="runs.length === 0" class="p-4">
            <EmptyState icon="i-lucide-history" title="No runs yet" description="Configure a portfolio and scenarios, then run your first optimization.">
              <UButton icon="i-lucide-play" label="New run" :to="`/p/${projectId}/runs/new`" />
            </EmptyState>
          </div>
          <div v-else class="overflow-x-auto">
            <table class="w-full min-w-[1000px] text-sm">
              <thead class="bg-ink-950/[0.05] dark:bg-black/25 text-left text-xs font-semibold text-muted">
                <tr>
                  <th scope="col" class="px-4 py-2.5">Run</th>
                  <th scope="col" class="px-3 py-2.5" :aria-sort="ariaSort('created')">
                    <button type="button" class="inline-flex items-center gap-1" @click="toggleSort('created')">
                      Created <UIcon :name="sortKey === 'created' ? (sortDir === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down') : 'i-lucide-arrow-up-down'" class="size-3" />
                    </button>
                  </th>
                  <th scope="col" class="px-3 py-2.5">Inputs</th>
                  <th scope="col" class="px-3 py-2.5">Changed since previous run</th>
                  <th scope="col" class="px-3 py-2.5 text-right" :aria-sort="ariaSort('objective')">
                    <button type="button" class="inline-flex items-center gap-1" @click="toggleSort('objective')">
                      Objective <UIcon :name="sortKey === 'objective' ? (sortDir === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down') : 'i-lucide-arrow-up-down'" class="size-3" />
                    </button>
                  </th>
                  <th scope="col" class="px-3 py-2.5">Status</th>
                  <th scope="col" class="px-3 py-2.5 text-right" :aria-sort="ariaSort('solve')">
                    <button type="button" class="inline-flex items-center gap-1" @click="toggleSort('solve')">
                      Solve time <UIcon :name="sortKey === 'solve' ? (sortDir === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down') : 'i-lucide-arrow-up-down'" class="size-3" />
                    </button>
                  </th>
                  <th scope="col" class="w-10 px-2 py-2.5"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="run in visibleRuns"
                  :key="run.id"
                  class="cursor-pointer border-t border-muted hover:bg-elevated/60"
                  @click="router.push(`/p/${projectId}/runs/${run.id}`)"
                >
                  <td class="px-4 py-2.5">
                    <NuxtLink :to="`/p/${projectId}/runs/${run.id}`" class="font-mono font-medium text-primary" @click.stop>{{ run.display_id }}</NuxtLink>
                  </td>
                  <td class="px-3 py-2.5 text-default">{{ fmtDateTime(run.created_at) }}</td>
                  <td class="px-3 py-2.5">
                    <div class="text-highlighted">{{ portfolioLabel(run) }} · {{ scenarioLabel(run) }}</div>
                    <div class="text-xs text-muted">{{ riskLabel(run) }}</div>
                  </td>
                  <td class="px-3 py-2.5">
                    <template v-if="changesFor(run)">
                      <div v-if="changesFor(run)!.length" class="flex flex-wrap gap-1">
                        <UBadge v-for="c in changesFor(run)" :key="c" color="neutral" variant="subtle" size="sm" :label="c" />
                      </div>
                      <span v-else class="text-xs text-muted">Same inputs</span>
                    </template>
                    <span v-else class="text-xs text-muted">First run</span>
                  </td>
                  <td class="px-3 py-2.5 text-right">
                    <div class="font-mono text-highlighted">{{ fmtMoney(run.objective_value) }}</div>
                    <div v-if="deltaFor(run)" class="font-mono text-xs" :class="deltaClass(deltaFor(run)!.kind)">{{ deltaFor(run)!.text }}</div>
                  </td>
                  <td class="px-3 py-2.5"><StatusBadge :status="run.status" /></td>
                  <td class="px-3 py-2.5 text-right font-mono text-xs text-muted">{{ fmtDuration(run.solve_time_seconds) }}</td>
                  <td class="px-2 py-2.5" @click.stop>
                    <UDropdownMenu :items="menuItems(run)">
                      <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" size="xs" :aria-label="`Actions for ${run.display_id}`" />
                    </UDropdownMenu>
                  </td>
                </tr>
                <tr v-if="visibleRuns.length === 0">
                  <td colspan="8" class="px-4 py-10 text-center text-sm text-muted">No runs match this filter.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </template>
  </UDashboardPanel>
</template>
