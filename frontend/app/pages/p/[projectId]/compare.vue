<script setup lang="ts">
import type { PortfolioVersion, Run, ScenarioSet } from "~/types";

const route = useRoute();
const router = useRouter();
const projectId = computed(() => Number(route.params.projectId));
const { currentProject } = useCurrentProject();
const { listRuns, getRun } = useRuns();
const { getPortfolioVersion } = usePortfolio();
const { getScenarioSet } = useScenarioSets();

const allRuns = ref<Run[]>([]);
const runA = ref<Run | null>(null);
const runB = ref<Run | null>(null);
const pvA = ref<PortfolioVersion | null>(null);
const pvB = ref<PortfolioVersion | null>(null);
const ssA = ref<ScenarioSet | null>(null);
const ssB = ref<ScenarioSet | null>(null);
const loading = ref(true);

async function loadRunDetails(runId: number) {
  const run = await getRun(runId);
  const [pv, ss] = await Promise.all([getPortfolioVersion(run.portfolio_version_id), getScenarioSet(run.scenario_set_version_id)]);
  return { run, pv, ss };
}

const loadError = ref<string | null>(null);
async function init() {
  loading.value = true;
  loadError.value = null;
  try {
    await loadAll();
  } catch {
    loadError.value = "Could not load runs for comparison.";
  } finally {
    loading.value = false;
  }
}
async function loadAll() {
  allRuns.value = await listRuns(projectId.value);
  const aId = route.query.a ? Number(route.query.a) : allRuns.value.find((r) => hasResults(r.status))?.id;
  if (aId) {
    const a = await loadRunDetails(aId);
    runA.value = a.run;
    pvA.value = a.pv;
    ssA.value = a.ss;
  }
  const bId = route.query.b ? Number(route.query.b) : null;
  if (bId) {
    const b = await loadRunDetails(bId);
    runB.value = b.run;
    pvB.value = b.pv;
    ssB.value = b.ss;
  } else {
    runB.value = null;
  }
}
await init();
watch(() => [route.query.a, route.query.b], init);

function setRun(which: "a" | "b", id: number | null) {
  router.push({ query: { ...route.query, [which]: id ?? undefined } });
}

function relation(a: Run, b: Run) {
  const diffs: string[] = [];
  if (a.portfolio_version_id !== b.portfolio_version_id) diffs.push("portfolio");
  if (a.scenario_set_version_id !== b.scenario_set_version_id) diffs.push("scenarios");
  const aCvar = JSON.stringify(a.objective.cvar);
  const bCvar = JSON.stringify(b.objective.cvar);
  if (aCvar !== bCvar) diffs.push("risk");
  if (diffs.length === 0) return { label: "same inputs", clean: true };
  if (diffs.length === 1) return { label: `differs in ${diffs[0]}`, clean: true };
  return { label: `differs in ${diffs.join(" + ")}`, clean: false };
}

const solvedRuns = computed(() => allRuns.value.filter((r) => hasResults(r.status)));
const runItems = (excludeId?: number) =>
  solvedRuns.value.filter((r) => r.id !== excludeId).map((r) => ({ label: `${r.display_id} · ${fmtMoney(r.objective_value)} · ${fmtDateTime(r.created_at)}`, value: r.id }));

function sumRows(run: Run | null, suffixes: string[]): number | null {
  if (!run?.results) return null;
  let total = 0;
  for (const name of Object.keys(run.results.by_scenario)) {
    const prob = run.results.probabilities[name] ?? 1;
    const scen = run.results.by_scenario[name];
    for (const row of scen.profit_breakdown.rows) {
      if (suffixes.some((suf) => row.label.endsWith(suf))) total += row.value * prob;
    }
  }
  return total;
}

function startupCount(run: Run | null): number | null {
  if (!run?.results) return null;
  let total = 0;
  for (const name of Object.keys(run.results.by_scenario)) {
    const prob = run.results.probabilities[name] ?? 1;
    const scen = run.results.by_scenario[name];
    for (const d of Object.values(scen.generators)) total += d.startup.filter((v) => v > 0.5).length * prob;
  }
  return total;
}

type OutcomeRow = { label: string; hint: string; a: number | null; b: number | null; higherBetter: boolean; unit: "money" | "count" };
const outcomeRows = computed(() => {
  if (!runA.value) return [];
  const a = runA.value;
  const b = runB.value;
  const rows: OutcomeRow[] = [
    { label: "Objective value", hint: "Solver objective", a: a.objective_value, b: b?.objective_value ?? null, higherBetter: true, unit: "money" },
    { label: "Expected profit", hint: "Probability-weighted", a: a.results?.expected_profit ?? null, b: b?.results?.expected_profit ?? null, higherBetter: true, unit: "money" },
    { label: "CVaR (profit)", hint: "Mean of worst-tail outcomes", a: a.results?.cvar ?? null, b: b?.results?.cvar ?? null, higherBetter: true, unit: "money" },
    { label: "Market net revenue", hint: "Sales + purchases", a: sumRows(a, ["sales", "purchases"]), b: sumRows(b, ["sales", "purchases"]), higherBetter: true, unit: "money" },
    { label: "Fuel cost", hint: "Expected · negative = spend", a: sumRows(a, ["fuel"]), b: sumRows(b, ["fuel"]), higherBetter: true, unit: "money" },
    { label: "Startup cost", hint: "Expected · negative = spend", a: sumRows(a, ["startups"]), b: sumRows(b, ["startups"]), higherBetter: true, unit: "money" },
    { label: "Generator startups", hint: "Expected count", a: startupCount(a), b: startupCount(b), higherBetter: false, unit: "count" },
  ];
  return rows.map((r) => ({ ...r, delta: r.a !== null && r.b !== null ? r.b - r.a : null }));
});

const showUnchanged = ref(false);
const isChanged = (r: { delta: number | null }) => r.delta !== null && Math.abs(r.delta) >= 1e-6;
const allIdentical = computed(() => outcomeRows.value.length > 0 && outcomeRows.value.every((r) => !isChanged(r)));
const sortedRows = computed(() => [...outcomeRows.value].sort((a, b) => Number(isChanged(b)) - Number(isChanged(a))));
const visibleRows = computed(() => (showUnchanged.value ? sortedRows.value : sortedRows.value.filter(isChanged)));
const unchangedCount = computed(() => outcomeRows.value.filter((r) => !isChanged(r)).length);

function deltaClass(row: (typeof outcomeRows.value)[number]) {
  if (row.delta === null) return "text-dimmed";
  if (Math.abs(row.delta) < 1e-6) return "text-muted";
  const better = row.higherBetter ? row.delta > 0 : row.delta < 0;
  return better ? "text-success" : "text-error";
}
const fmtCell = (row: OutcomeRow, v: number | null, opts: { plus?: boolean } = {}) =>
  row.unit === "money" ? fmtMoney(v, opts) : v === null ? "—" : `${opts.plus && v > 0 ? "+" : ""}${fmtNum(v, 1)}`;

const scenarioA = computed(() => (runA.value?.results ? Object.values(runA.value.results.by_scenario)[0] : null));
const scenarioB = computed(() => (runB.value?.results ? Object.values(runB.value.results.by_scenario)[0] : null));
// Same MW scale on both charts so bar heights are directly comparable. Supply
// stacks above zero; exports and charging stack below it.
const sharedYRange = computed<[number, number] | undefined>(() => {
  if (!scenarioA.value || !scenarioB.value) return undefined;
  let up = 0;
  let down = 0;
  for (const s of [scenarioA.value, scenarioB.value]) {
    const n = s.generators[Object.keys(s.generators)[0] ?? ""]?.power.length ?? 0;
    for (let t = 0; t < n; t++) {
      let pos = 0;
      let neg = 0;
      for (const d of Object.values(s.generators)) pos += d.power[t] ?? 0;
      for (const d of Object.values(s.storages)) {
        const v = d.net_power[t] ?? 0;
        if (v >= 0) pos += v;
        else neg -= v;
      }
      for (const d of Object.values(s.markets)) {
        pos += d.buy_volume[t] ?? 0;
        neg += d.sell_volume[t] ?? 0;
      }
      up = Math.max(up, pos);
      down = Math.max(down, neg);
    }
  }
  const round = (v: number) => Math.ceil((v * 1.05) / 50) * 50;
  return [-round(down), round(up)];
});

const colorsFor = (pv: PortfolioVersion | null) => assetColorMap(pv?.assets);
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <PageHeader :crumbs="[{ label: currentProject?.name ?? 'Project', to: `/p/${projectId}/runs` }, { label: 'Compare' }]">
        <template v-if="runA && runB" #meta>
          <UBadge :color="relation(runA, runB).clean ? 'success' : 'neutral'" variant="subtle" size="sm" :label="relation(runA, runB).label" />
        </template>
      </PageHeader>
    </template>

    <template #body>
      <PageSkeleton v-if="loading" />
      <ErrorState v-else-if="loadError" :message="loadError" @retry="init" />
      <EmptyState v-else-if="!runA" icon="i-lucide-git-compare" title="No runs to compare yet" description="Solve at least two runs to compare their outcomes side by side.">
        <UButton icon="i-lucide-play" label="New run" :to="`/p/${projectId}/runs/new`" />
      </EmptyState>
      <div v-else class="flex flex-col gap-5">
        <div class="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
          <div class="flex flex-col gap-2 rounded-lg border border-default p-3.5">
            <div class="flex items-center gap-2">
              <span class="flex size-5 items-center justify-center rounded bg-inverted text-xs font-bold text-inverted">A</span>
              <span class="text-xs font-medium text-muted">Baseline</span>
            </div>
            <USelectMenu :model-value="runA.id" :items="runItems()" value-key="value" class="w-full" aria-label="Baseline run" @update:model-value="(v: number) => setRun('a', v)" />
            <span class="truncate text-xs text-muted">{{ pvA?.name }} v{{ pvA?.version }} · {{ ssA?.name }} v{{ ssA?.version }}</span>
          </div>
          <div class="flex flex-col gap-2 rounded-lg border border-default p-3.5">
            <div class="flex items-center gap-2">
              <span class="flex size-5 items-center justify-center rounded bg-primary text-xs font-bold text-inverted">B</span>
              <span class="text-xs font-medium text-muted">Variant</span>
            </div>
            <USelectMenu :model-value="runB?.id" :items="runItems(runA.id)" value-key="value" placeholder="Choose a run to compare" class="w-full" aria-label="Variant run" @update:model-value="(v: number) => setRun('b', v)" />
            <span v-if="runB" class="truncate text-xs text-muted">{{ pvB?.name }} v{{ pvB?.version }} · {{ ssB?.name }} v{{ ssB?.version }}</span>
            <span v-else class="text-xs text-muted">Differences are shown as B − A.</span>
          </div>
        </div>

        <EmptyState v-if="!runB" icon="i-lucide-git-compare" title="Pick a second run" :description="solvedRuns.length < 2 ? 'Only one solved run exists — run another configuration to compare.' : `Choose a variant above to compare with ${runA.display_id}.`" />

        <template v-else>
          <div
            v-if="allIdentical"
            class="flex items-start gap-3 rounded-lg border border-default bg-default p-4"
            role="status"
          >
            <UIcon name="i-lucide-equal" class="mt-0.5 size-5 shrink-0 text-muted" />
            <div>
              <p class="text-sm font-semibold text-highlighted">These runs produced identical results</p>
              <p class="text-xs text-muted">
                {{ runA.display_id }} and {{ runB.display_id }} match on every outcome ({{ relation(runA, runB).label }}).
                Re-running with a different portfolio, scenario set or risk setting will show differences here.
              </p>
            </div>
            <USwitch v-model="showUnchanged" class="ml-auto shrink-0" size="sm" label="Show outcomes" />
          </div>

          <Panel
            v-if="!allIdentical || showUnchanged"
            title="Outcomes"
            :description="allIdentical ? 'All outcomes match.' : 'Changed outcomes first. Green = B is better than A, red = worse. Costs are negative contributions to profit, so a smaller spend reads as a positive change.'"
            flush
          >
            <template v-if="unchangedCount > 0 && !allIdentical" #actions>
              <USwitch v-model="showUnchanged" size="sm" :label="`Show unchanged (${unchangedCount})`" />
            </template>
            <div v-if="visibleRows.length" class="overflow-x-auto">
              <table class="w-full min-w-[560px] text-sm">
                <thead class="bg-ink-950/[0.05] dark:bg-black/25 text-xs font-semibold text-muted">
                  <tr>
                    <th scope="col" class="px-4 py-2 text-left">Outcome</th>
                    <th scope="col" class="px-3 py-2 text-right">A · {{ runA.display_id }}</th>
                    <th scope="col" class="px-3 py-2 text-right">B · {{ runB.display_id }}</th>
                    <th scope="col" class="px-4 py-2 text-right">B − A</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in visibleRows"
                    :key="row.label"
                    class="border-t border-muted"
                    :class="isChanged(row) ? 'bg-primary/5' : 'text-muted'"
                  >
                    <th scope="row" class="px-4 py-2.5 text-left font-normal">
                      <span :class="isChanged(row) ? 'font-medium text-highlighted' : 'text-default'">{{ row.label }}</span>
                      <span class="ml-2 text-xs text-muted">{{ row.hint }}</span>
                    </th>
                    <td class="px-3 py-2.5 text-right font-mono">{{ fmtCell(row, row.a) }}</td>
                    <td class="px-3 py-2.5 text-right font-mono">{{ fmtCell(row, row.b) }}</td>
                    <td class="px-4 py-2.5 text-right font-mono font-medium" :class="deltaClass(row)">{{ isChanged(row) ? fmtCell(row, row.delta, { plus: true }) : "no change" }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>

          <ClientOnly v-if="scenarioA && scenarioB">
            <div class="grid grid-cols-[repeat(auto-fit,minmax(420px,1fr))] gap-4">
              <Panel :title="`A · ${runA.display_id}`" description="Dispatch, MW — shared y-axis">
                <DispatchChart
                  :scenario="scenarioA"
                  :load-profiles="ssA?.scenarios[0]?.load_profiles ?? {}"
                  :market-prices="ssA?.scenarios[0]?.market_prices ?? {}"
                  :asset-colors="colorsFor(pvA)"
                  :steps="runA.results!.number_of_steps"
                  :step-hours="ssA?.timestep_hours ?? 1"
                  :y-range="sharedYRange"
                  :height="280"
                />
              </Panel>
              <Panel :title="`B · ${runB.display_id}`" description="Dispatch, MW — shared y-axis">
                <DispatchChart
                  :scenario="scenarioB"
                  :load-profiles="ssB?.scenarios[0]?.load_profiles ?? {}"
                  :market-prices="ssB?.scenarios[0]?.market_prices ?? {}"
                  :asset-colors="colorsFor(pvB)"
                  :steps="runB.results!.number_of_steps"
                  :step-hours="ssB?.timestep_hours ?? 1"
                  :y-range="sharedYRange"
                  :height="280"
                />
              </Panel>
            </div>
            <p class="text-xs text-dimmed">Dispatch charts show each run's first scenario.</p>
          </ClientOnly>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
