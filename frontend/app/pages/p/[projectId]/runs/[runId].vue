<script setup lang="ts">
import type { KpiDelta } from "~/components/ui/KpiCard.vue";
import type { GeneratorAsset, MarketAsset, PortfolioVersion, Run, ScenarioSet, StorageAsset } from "~/types";

const route = useRoute();
const router = useRouter();
const projectId = computed(() => Number(route.params.projectId));
const runId = computed(() => Number(route.params.runId));

const { getRun, listRuns } = useRuns();
const { getPortfolioVersion } = usePortfolio();
const { getScenarioSet } = useScenarioSets();
const { createSweep } = useRuns();

const run = ref<Run | null>(null);
const portfolioVersion = ref<PortfolioVersion | null>(null);
const scenarioSet = ref<ScenarioSet | null>(null);
const loading = ref(true);
const sweeping = ref(false);
const toast = useToast();
const sweepRuns = ref<Run[]>([]);

const loadError = ref<string | null>(null);
async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const r = await getRun(runId.value);
    run.value = r;
    const [pv, ss] = await Promise.all([getPortfolioVersion(r.portfolio_version_id), getScenarioSet(r.scenario_set_version_id)]);
    portfolioVersion.value = pv;
    scenarioSet.value = ss;
  } catch (e: any) {
    run.value = null;
    loadError.value = e?.status === 404 || e?.statusCode === 404 ? "This run does not exist." : "Could not load this run.";
  } finally {
    loading.value = false;
  }
}
await load();
watch(runId, load);

// Reference for the headline figure: the best run (by expected profit) in this project.
const projectRuns = ref<Run[]>([]);
async function loadProjectRuns() {
  try {
    projectRuns.value = (await listRuns(projectId.value)).filter((r) => hasResults(r.status) && r.results);
  } catch {
    projectRuns.value = []; // the comparison is optional; the page works without it
  }
}
onMounted(loadProjectRuns);
watch(projectId, loadProjectRuns);

const assetColors = computed(() => assetColorMap(portfolioVersion.value?.assets));
const generators = computed(() => portfolioVersion.value?.assets.filter((a): a is GeneratorAsset => a.kind === "generator") ?? []);
const storages = computed(() => portfolioVersion.value?.assets.filter((a): a is StorageAsset => a.kind === "storage") ?? []);
const markets = computed(() => portfolioVersion.value?.assets.filter((a): a is MarketAsset => a.kind === "market") ?? []);
const stepHours = computed(() => scenarioSet.value?.timestep_hours ?? 1);

const isStochastic = computed(() => scenarioSet.value?.mode === "stochastic");
const selectedScenario = ref<string>("");
watch(
  () => run.value?.results,
  (results) => {
    if (results) selectedScenario.value = results.scenarios[0]?.name ?? "";
  },
  { immediate: true },
);

const currentScenarioResults = computed(() => {
  if (!run.value?.results) return null;
  return run.value.results.by_scenario[selectedScenario.value] ?? null;
});
const currentScenarioDef = computed(() => scenarioSet.value?.scenarios.find((s) => s.name === selectedScenario.value) ?? null);

const tabs = computed(() => [
  { value: "dispatch", label: "Dispatch", icon: "i-lucide-chart-area" },
  { value: "uc", label: "Unit commitment", icon: "i-lucide-table-2" },
  { value: "storage", label: "Storage", icon: "i-lucide-battery" },
  { value: "market", label: "Market", icon: "i-lucide-trending-up" },
  { value: "profit", label: "Profit breakdown", icon: "i-lucide-receipt" },
  ...(isStochastic.value
    ? [
        { value: "spread", label: "Scenario spread", icon: "i-lucide-chart-column" },
        { value: "frontier", label: "Risk frontier", icon: "i-lucide-radar" },
      ]
    : []),
]);

// The active tab lives in the URL so views are linkable and Back works.
const activeTab = computed({
  get: () => {
    const t = String(route.query.tab ?? "dispatch");
    return tabs.value.some((x) => x.value === t) ? t : "dispatch";
  },
  set: (v: string) => router.replace({ query: { ...route.query, tab: v === "dispatch" ? undefined : v } }),
});

const startupCount = computed(() => {
  const scen = Object.values(run.value?.results?.by_scenario ?? {})[0];
  return scen ? Object.values(scen.generators).reduce((s, g) => s + g.startup.filter((v) => v > 0.5).length, 0) : 0;
});

const profitTone = (v: number | null | undefined) => (v == null ? "default" : v >= 0 ? "good" : "bad") as "default" | "good" | "bad";

const bestRun = computed(() =>
  projectRuns.value.reduce<Run | null>((best, r) => (!best || r.results!.expected_profit > best.results!.expected_profit ? r : best), null),
);

const profitDelta = computed<KpiDelta | undefined>(() => {
  const r = run.value;
  const best = bestRun.value;
  if (!r?.results || !best || projectRuns.value.length < 2) return undefined;
  if (best.id === r.id) return { text: `Best of ${projectRuns.value.length} runs`, tone: "good", icon: "i-lucide-trophy" };
  const gap = r.results.expected_profit - best.results!.expected_profit;
  return { text: `${fmtMoney(gap)} vs best (${best.display_id})`, tone: "bad", icon: "i-lucide-arrow-down-right" };
});

const scenarioRange = computed(() => {
  const vals = Object.values(run.value?.results?.profit_by_scenario ?? {});
  return vals.length > 1 ? { min: Math.min(...vals), max: Math.max(...vals) } : null;
});

const heroKpi = computed(() => {
  const r = run.value;
  if (!r?.results) return null;
  return {
    label: isStochastic.value ? "Expected profit" : "Profit",
    value: fmtMoney(r.results.expected_profit),
    tone: profitTone(r.results.expected_profit),
    sub: isStochastic.value ? `Probability-weighted over ${r.results.scenarios.length} scenarios` : "Single deterministic scenario",
  };
});

const secondaryKpis = computed(() => {
  const r = run.value;
  if (!r?.results) return [];
  if (isStochastic.value) {
    const cl = r.objective.cvar?.confidence_level ?? 0.95;
    return [
      {
        label: `CVaR ${fmtPct(cl)}`,
        value: r.results.cvar !== null ? fmtMoney(r.results.cvar) : "—",
        tone: profitTone(r.results.cvar),
        hint: `Mean profit of the worst ${fmtPct(1 - cl)} of outcomes. Higher means less downside risk.`,
        sub: "Tail profit",
        icon: "i-lucide-shield-alert",
      },
      {
        label: "Objective value",
        value: fmtMoney(r.objective_value),
        hint: `What the solver maximised: E[profit]${r.objective.cvar ? ` + ${r.objective.cvar.weight} × CVaR` : ""}.`,
        sub: r.objective.cvar ? `E[profit] + ${r.objective.cvar.weight} × CVaR` : "E[profit]",
        icon: "i-lucide-target",
      },
      { label: "Generator startups", value: String(startupCount.value), sub: "First scenario", icon: "i-lucide-power" },
    ];
  }
  return [
    { label: "Objective value", value: fmtMoney(r.objective_value), hint: "What the solver maximised.", sub: "Solver objective", icon: "i-lucide-target" },
    { label: "Generator startups", value: String(startupCount.value), sub: "Across the horizon", icon: "i-lucide-power" },
  ];
});

const scenarioChips = computed(() => run.value?.results?.scenarios ?? []);

async function runSweep() {
  if (!run.value || !portfolioVersion.value || !scenarioSet.value) return;
  sweeping.value = true;
  try {
    const runs = await createSweep(projectId.value, {
      portfolio_version_id: run.value.portfolio_version_id,
      scenario_set_version_id: run.value.scenario_set_version_id,
      solver: run.value.solver,
      profit_weight: run.value.objective.profit_weight,
      confidence_level: run.value.objective.cvar?.confidence_level ?? 0.95,
      cvar_weights: [0, 0.25, 0.5, 1, 2, 4],
    });
    sweepRuns.value = runs;
    toast.add({ title: `Sweep complete`, description: `${runs.length} runs added to history`, color: "success", icon: "i-lucide-circle-check" });
  } catch (e: any) {
    toast.add({ title: "Sweep failed", description: e?.data?.detail ? String(e.data.detail) : "The solver did not return results.", color: "error" });
  } finally {
    sweeping.value = false;
  }
}

const frontierRuns = computed(() => (sweepRuns.value.length ? sweepRuns.value : run.value ? [run.value] : []));
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <PageHeader :crumbs="[{ label: 'Runs', to: `/p/${projectId}/runs` }, { label: run?.display_id ?? `Run ${runId}` }]">
        <template v-if="run" #meta><StatusBadge :status="run.status" /></template>
        <template v-if="run" #actions>
          <UButton color="neutral" variant="outline" icon="i-lucide-rotate-cw" label="Re-run" :to="`/p/${projectId}/runs/new?from=${run.id}`" />
          <UButton color="neutral" variant="outline" icon="i-lucide-git-compare" label="Compare with…" :disabled="!hasResults(run.status)" :to="`/p/${projectId}/compare?a=${run.id}`" />
        </template>
      </PageHeader>
    </template>

    <template #body>
      <PageSkeleton v-if="loading" />
      <ErrorState v-else-if="loadError" :message="loadError" @retry="load" />

      <Panel v-else-if="run && !hasResults(run.status)" :title="run.status === 'infeasible' ? 'Infeasible run' : 'Run failed'" description="The solver did not return a schedule.">
        <dl class="mb-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-xs">
          <dt class="text-muted">solver_status</dt><dd>{{ run.solver_status ?? "—" }}</dd>
          <dt class="text-muted">termination_condition</dt><dd>{{ run.termination_condition ?? "—" }}</dd>
          <dt class="text-muted">objective_value</dt><dd>{{ run.objective_value ?? "None" }}</dd>
        </dl>
        <UAlert v-if="run.error_message" color="error" variant="subtle" :description="run.error_message" class="mb-3" />
        <p v-if="run.status === 'infeasible'" class="mb-3 text-sm text-muted">
          Infeasible usually means demand cannot be met with the available capacity, or storage SoC bounds conflict. Review the portfolio and scenario inputs, then re-run.
        </p>
        <div class="flex gap-2">
          <UButton color="neutral" variant="outline" label="Edit portfolio" icon="i-lucide-boxes" :to="`/p/${projectId}/portfolio`" />
          <UButton color="neutral" variant="outline" label="Re-run with changes" icon="i-lucide-rotate-cw" :to="`/p/${projectId}/runs/new?from=${run.id}`" />
        </div>
      </Panel>

      <div v-else-if="run" class="flex flex-col gap-5">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span class="text-default">{{ portfolioVersion?.name }} v{{ portfolioVersion?.version }}</span>·
          <span class="text-default">{{ scenarioSet?.name }} v{{ scenarioSet?.version }}</span>·
          <span>{{ scenarioSet?.number_of_steps }} steps × {{ scenarioSet?.timestep_hours }} h</span>·
          <span v-if="run.objective.cvar">CVaR weight {{ run.objective.cvar.weight }} @ {{ fmtPct(run.objective.cvar.confidence_level) }}</span>
          <span v-else>{{ isStochastic ? "Risk-neutral" : "Deterministic" }}</span>·
          <span>{{ run.solver.solver_name.toUpperCase() }} · {{ fmtDuration(run.solve_time_seconds) }} · {{ run.termination_condition ?? "—" }}</span>·
          <span>{{ fmtDateTime(run.created_at) }}</span>
        </p>

        <div v-if="heroKpi" class="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <KpiCard size="hero" v-bind="heroKpi" :delta="profitDelta">
            <RangeBar
              v-if="scenarioRange"
              :min="scenarioRange.min"
              :max="scenarioRange.max"
              :expected="run.results!.expected_profit"
              :tail="run.results!.cvar"
              :format="fmtMoney"
            />
          </KpiCard>
          <div class="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
            <KpiCard v-for="k in secondaryKpis" :key="k.label" v-bind="k" />
          </div>
        </div>

        <UAlert
          v-if="run.status === 'time_limit'"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Stopped at the time limit"
          :description="`Stopped after ${run.solver.time_limit}s. The schedule is feasible but not proven optimal. Re-run with a longer time limit or a looser MIP gap.`"
          :actions="[{ label: 'Re-run with changes', color: 'neutral', variant: 'outline', to: `/p/${projectId}/runs/new?from=${run.id}` }]"
        />

        <div class="flex flex-wrap items-center justify-between gap-3">
          <UTabs v-model="activeTab" :items="tabs" :content="false" variant="link" size="sm" :ui="{ root: 'w-auto' }" />
          <SegmentedControl
            v-if="isStochastic && scenarioChips.length && ['dispatch', 'uc', 'storage', 'market', 'profit'].includes(activeTab)"
            v-model="selectedScenario"
            label="Scenario"
            :items="scenarioChips.map((s) => ({ value: s.name, label: `${s.name} · p=${s.probability.toFixed(2)}` }))"
          />
        </div>

        <ClientOnly v-if="currentScenarioResults">
          <div v-if="activeTab === 'dispatch'" class="flex flex-col gap-4">
            <Panel title="Dispatch" description="Power by source per timestep (MW)">
              <DispatchChart
                :scenario="currentScenarioResults"
                :load-profiles="currentScenarioDef?.load_profiles ?? {}"
                :market-prices="currentScenarioDef?.market_prices ?? {}"
                :asset-colors="assetColors"
                :steps="run.results!.number_of_steps"
                :step-hours="stepHours"
              />
            </Panel>
            <EnergyBalance
              :scenario="currentScenarioResults"
              :generators="generators"
              :load-profiles="currentScenarioDef?.load_profiles ?? {}"
              :asset-colors="assetColors"
              :step-hours="stepHours"
            />
          </div>
          <UnitCommitmentGrid v-else-if="activeTab === 'uc'" :scenario="currentScenarioResults" :generators="generators" :asset-colors="assetColors" :step-hours="stepHours" />
          <StorageChart v-else-if="activeTab === 'storage'" :scenario="currentScenarioResults" :storages="storages" :step-hours="stepHours" />
          <MarketChart v-else-if="activeTab === 'market'" :scenario="currentScenarioResults" :markets="markets" :market-prices="currentScenarioDef?.market_prices ?? {}" :step-hours="stepHours" />
          <ProfitBreakdown v-else-if="activeTab === 'profit'" :scenario="currentScenarioResults" />
          <ScenarioSpreadChart v-else-if="activeTab === 'spread'" :results="run.results!" :selected-scenario="selectedScenario" :confidence-level="run.objective.cvar?.confidence_level ?? null" :step-hours="stepHours" />
          <RiskFrontierChart v-else-if="activeTab === 'frontier'" :runs="frontierRuns" :current-run="run" :sweeping="sweeping" @sweep="runSweep" />
        </ClientOnly>
      </div>
    </template>
  </UDashboardPanel>
</template>
