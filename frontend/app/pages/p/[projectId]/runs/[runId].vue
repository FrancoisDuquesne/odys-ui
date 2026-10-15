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

const startupCount = computed(() => verdict.value?.startups ?? 0);

// A net cost is a normal outcome for a load-serving portfolio, so it is not shown in alarm red.
const profitTone = (v: number | null | undefined) => (v != null && v > 0 ? "good" : "default") as "default" | "good" | "bad";

const verdict = computed(() => (run.value ? buildVerdict(run.value, scenarioSet.value) : null));
const isCost = computed(() => (run.value?.results?.expected_profit ?? 0) < 0);

const bestRun = computed(() =>
  projectRuns.value.reduce<Run | null>((best, r) => (!best || r.results!.expected_profit > best.results!.expected_profit ? r : best), null),
);

const profitDelta = computed<KpiDelta | undefined>(() => {
  const r = run.value;
  const best = bestRun.value;
  if (!r?.results || !best || projectRuns.value.length < 2) return undefined;
  if (best.id === r.id) return { text: `Best of ${projectRuns.value.length} runs`, tone: "good", icon: "i-lucide-trophy" };
  const gap = r.results.expected_profit - best.results!.expected_profit;
  return { text: `${fmtMoney(Math.abs(gap))} ${gap < 0 ? "worse" : "better"} than best (${best.display_id})`, tone: "neutral", icon: "i-lucide-arrow-down-right" };
});

const scenarioRange = computed(() => {
  const vals = Object.values(run.value?.results?.profit_by_scenario ?? {});
  return vals.length > 1 ? { min: Math.min(...vals), max: Math.max(...vals) } : null;
});

const heroKpi = computed(() => {
  const r = run.value;
  if (!r?.results) return null;
  const p = r.results.expected_profit;
  const label = `${isStochastic.value ? "Expected " : ""}${isCost.value ? "net cost" : "profit"}`;
  return {
    label: label.charAt(0).toUpperCase() + label.slice(1),
    value: fmtMoney(Math.abs(p)),
    tone: profitTone(p),
    hint: isCost.value ? "Costs of generation and market purchases minus market sales. Lower is better." : undefined,
    sub: isStochastic.value ? `Probability-weighted over ${r.results.scenarios.length} scenarios` : "Single deterministic scenario",
  };
});

const secondaryKpis = computed(() => {
  const r = run.value;
  if (!r?.results) return [];
  if (isStochastic.value) {
    const cl = r.objective.cvar?.confidence_level ?? 0.95;
    const tail = r.results.cvar;
    return [
      {
        label: tail !== null && tail < 0 ? "Worst-case cost" : "Worst-case profit",
        value: tail !== null ? fmtMoney(Math.abs(tail)) : "—",
        tone: "default" as const,
        hint: `Average result over the worst ${fmtPct(1 - cl)} of scenarios (CVaR). Shows downside risk.`,
        sub: `Average of the worst ${fmtPct(1 - cl)} of outcomes (CVaR ${fmtPct(cl)})`,
        icon: "i-lucide-shield-alert",
      },
      {
        label: "Optimised score",
        value: fmtMoney(r.objective_value),
        hint: `Objective value: what the solver maximised, E[profit]${r.objective.cvar ? ` + ${r.objective.cvar.weight} × CVaR` : ""}.`,
        sub: r.objective.cvar ? `Profit blended with risk (weight ${r.objective.cvar.weight})` : "Expected profit",
        icon: "i-lucide-target",
      },
      { label: "Generator starts", value: String(startupCount.value), sub: "Expected across scenarios", icon: "i-lucide-power" },
    ];
  }
  const out = [{ label: "Generator starts", value: String(startupCount.value), sub: "Across the horizon", icon: "i-lucide-power" }] as { label: string; value: string; sub?: string; hint?: string; icon?: string }[];
  // The solver objective only adds information when it differs from the profit shown above.
  if (r.objective_value != null && Math.abs(r.objective_value - r.results.expected_profit) > 0.5) {
    out.unshift({ label: "Optimised score", value: fmtMoney(r.objective_value), hint: "Objective value: what the solver maximised.", sub: "Solver objective", icon: "i-lucide-target" });
  }
  if (verdict.value?.importShare != null) {
    out.push({ label: "Market purchases", value: fmtPct(verdict.value.importShare), sub: "Share of energy supplied", icon: "i-lucide-arrow-down-to-line" });
  }
  return out;
});

const printKpis = computed(() => [
  ...(heroKpi.value ? [{ label: heroKpi.value.label, value: heroKpi.value.value, sub: heroKpi.value.sub }] : []),
  ...secondaryKpis.value.map((k) => ({ label: k.label, value: k.value, sub: k.sub })),
]);

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

async function copyLink() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    toast.add({ title: "Link copied", icon: "i-lucide-link", color: "success" });
  } catch {
    toast.add({ title: "Could not copy the link", color: "error" });
  }
}
function downloadDispatch() {
  if (!run.value?.results) return;
  downloadText(`${run.value.display_id}-dispatch.csv`, dispatchCsv(run.value.results, stepHours.value));
}
function printSummary() {
  window.print();
}
const exportItems = computed(() => [
  [
    { label: "Download dispatch CSV", icon: "i-lucide-file-spreadsheet", disabled: !run.value || !hasResults(run.value.status), onSelect: downloadDispatch },
    { label: "Download summary", icon: "i-lucide-printer", disabled: !run.value || !hasResults(run.value.status), onSelect: printSummary },
  ],
  [{ label: "Copy link", icon: "i-lucide-link", onSelect: copyLink }],
]);
const headerMenu = computed(() => [
  [
    { label: "Re-run", icon: "i-lucide-rotate-cw", to: `/p/${projectId.value}/runs/new?from=${runId.value}` },
    { label: "Compare with…", icon: "i-lucide-git-compare", disabled: !run.value || !hasResults(run.value.status), to: `/p/${projectId.value}/compare?a=${runId.value}` },
  ],
  ...exportItems.value,
]);

// Plain-language explanations for runs that produced no schedule.
const failure = computed(() => {
  const r = run.value;
  if (!r) return null;
  const term = (r.termination_condition ?? "").toLowerCase();
  if (r.status === "infeasible" || term.includes("infeasible"))
    return { title: "No feasible schedule", text: "The solver proved that no schedule can satisfy every constraint at once. This usually means demand cannot be met with the available capacity, or storage limits conflict." };
  if (term.includes("time")) return { title: "Ran out of time", text: "The solver hit its time limit before finding a schedule." };
  return { title: "The solver could not finish", text: "The solver stopped before producing a schedule. Check the message below, adjust the inputs, and try again." };
});

const frontierRuns = computed(() => (sweepRuns.value.length ? sweepRuns.value : run.value ? [run.value] : []));
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <PageHeader :crumbs="[{ label: 'Runs', to: `/p/${projectId}/runs` }, { label: run?.display_id ?? `Run ${runId}` }]" :menu="run ? headerMenu : undefined">
        <template v-if="run" #meta><StatusBadge :status="run.status" /></template>
        <template v-if="run" #actions>
          <UButton color="neutral" variant="outline" icon="i-lucide-rotate-cw" label="Re-run" :to="`/p/${projectId}/runs/new?from=${run.id}`" />
          <UButton color="neutral" variant="outline" icon="i-lucide-git-compare" label="Compare with…" :disabled="!hasResults(run.status)" :to="`/p/${projectId}/compare?a=${run.id}`" />
          <UDropdownMenu :items="exportItems" :content="{ align: 'end' }">
            <UButton color="neutral" variant="outline" icon="i-lucide-download" trailing-icon="i-lucide-chevron-down" label="Export" />
          </UDropdownMenu>
        </template>
      </PageHeader>
    </template>

    <template #body>
      <PageSkeleton v-if="loading" />
      <ErrorState v-else-if="loadError" :message="loadError" @retry="load" />

      <Panel v-else-if="run && !hasResults(run.status)" :title="failure?.title" description="The solver did not return a schedule.">
        <p class="mb-3 text-sm text-default">{{ failure?.text }}</p>
        <UAlert v-if="run.error_message" color="error" variant="subtle" :description="run.error_message" class="mb-3" />
        <details class="mb-4 text-xs text-muted">
          <summary class="cursor-pointer select-none font-medium">Technical details</summary>
          <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono">
            <dt>solver_status</dt><dd class="text-default">{{ run.solver_status ?? "—" }}</dd>
            <dt>termination_condition</dt><dd class="text-default">{{ run.termination_condition ?? "—" }}</dd>
            <dt>objective_value</dt><dd class="text-default">{{ run.objective_value ?? "None" }}</dd>
          </dl>
        </details>
        <div class="flex flex-wrap gap-2">
          <UButton color="neutral" variant="outline" label="Edit portfolio" icon="i-lucide-boxes" :to="`/p/${projectId}/portfolio`" />
          <UButton color="neutral" variant="outline" label="Re-run with changes" icon="i-lucide-rotate-cw" :to="`/p/${projectId}/runs/new?from=${run.id}`" />
        </div>
      </Panel>

      <div v-else-if="run" class="flex flex-col gap-5 print:hidden">
        <div class="flex flex-col gap-3">
          <div v-if="verdict" class="flex flex-col gap-1">
            <h1 class="text-lg font-semibold text-highlighted sm:text-xl">{{ verdict.sentence }}</h1>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              icon="i-lucide-boxes"
              :label="`${portfolioVersion?.name ?? 'Portfolio'} v${portfolioVersion?.version ?? ''}`"
              :to="`/p/${projectId}/portfolio`"
            />
            <UPopover>
              <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-calendar-range" :label="`${scenarioSet?.name ?? 'Scenarios'} v${scenarioSet?.version ?? ''}`" trailing-icon="i-lucide-chevron-down" />
              <template #content>
                <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 p-4 text-xs">
                  <dt class="text-muted">Type</dt><dd>{{ isStochastic ? "Stochastic (several scenarios)" : "Deterministic (one scenario)" }}</dd>
                  <dt class="text-muted">Scenarios</dt><dd>{{ scenarioSet?.scenarios.length }}</dd>
                  <dt class="text-muted">Horizon</dt><dd>{{ scenarioSet?.number_of_steps }} steps × {{ scenarioSet?.timestep_hours }} h</dd>
                </dl>
              </template>
            </UPopover>
            <UPopover>
              <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-settings-2" label="Solver details" trailing-icon="i-lucide-chevron-down" />
              <template #content>
                <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 p-4 text-xs">
                  <dt class="text-muted">Solver</dt><dd>{{ run.solver.solver_name.toUpperCase() }}</dd>
                  <dt class="text-muted">Solve time</dt><dd>{{ fmtDuration(run.solve_time_seconds) }}</dd>
                  <dt class="text-muted">Outcome</dt><dd>{{ run.status === "optimal" ? "Proven optimal" : runStatus(run.status).label }}<span class="text-muted"> ({{ run.termination_condition ?? "—" }})</span></dd>
                  <dt class="text-muted">Horizon</dt><dd>{{ scenarioSet?.number_of_steps }} steps × {{ scenarioSet?.timestep_hours }} h</dd>
                  <dt class="text-muted">Risk</dt>
                  <dd>{{ run.objective.cvar ? `CVaR weight ${run.objective.cvar.weight} @ ${fmtPct(run.objective.cvar.confidence_level)}` : isStochastic ? "Risk-neutral" : "Deterministic" }}</dd>
                  <dt class="text-muted">Run at</dt><dd>{{ fmtDateTime(run.created_at) }}</dd>
                </dl>
              </template>
            </UPopover>
          </div>
        </div>

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
          <UnitCommitmentGrid v-else-if="activeTab === 'uc'" :market-prices="currentScenarioDef?.market_prices ?? {}" :scenario="currentScenarioResults" :generators="generators" :asset-colors="assetColors" :step-hours="stepHours" />
          <StorageChart v-else-if="activeTab === 'storage'" :scenario="currentScenarioResults" :storages="storages" :step-hours="stepHours" />
          <MarketChart v-else-if="activeTab === 'market'" :scenario="currentScenarioResults" :markets="markets" :market-prices="currentScenarioDef?.market_prices ?? {}" :step-hours="stepHours" />
          <ProfitBreakdown v-else-if="activeTab === 'profit'" :scenario="currentScenarioResults" />
          <ScenarioSpreadChart v-else-if="activeTab === 'spread'" :results="run.results!" :selected-scenario="selectedScenario" :confidence-level="run.objective.cvar?.confidence_level ?? null" :step-hours="stepHours" />
          <RiskFrontierChart v-else-if="activeTab === 'frontier'" :runs="frontierRuns" :current-run="run" :sweeping="sweeping" @sweep="runSweep" />
        </ClientOnly>
      </div>
      <RunSummary
        v-if="run && verdict && hasResults(run.status)"
        :run="run"
        :verdict="verdict"
        :portfolio-label="`${portfolioVersion?.name} v${portfolioVersion?.version}`"
        :scenario-label="`${scenarioSet?.name} v${scenarioSet?.version}`"
        :kpis="printKpis"
        :scenario-name="selectedScenario"
      />
    </template>
  </UDashboardPanel>
</template>
