<script setup lang="ts">
import type { CVaRConfig, PortfolioVersion, Run, ScenarioSet, SolverConfig } from "~/types";

const route = useRoute();
const router = useRouter();
const projectId = computed(() => Number(route.params.projectId));
const toast = useToast();
const { listPortfolioVersions } = usePortfolio();
const { listScenarioSets } = useScenarioSets();
const scenarioEditorOpen = ref(false);
function onScenarioSetCreated(ss: ScenarioSet) {
  scenarioSets.value = [...scenarioSets.value, ss];
  mode.value = ss.mode;
  scenarioSetId.value = ss.id;
}
const { createRun, getRun, listRuns } = useRuns();

const portfolioVersions = ref<PortfolioVersion[]>([]);
const scenarioSets = ref<ScenarioSet[]>([]);
const loading = ref(true);
const rerunFrom = ref<Run | null>(null);
const nextDisplayId = ref("R-????");

const mode = ref<"deterministic" | "stochastic">("deterministic");
const portfolioVersionId = ref<number | null>(null);
const scenarioSetId = ref<number | null>(null);
const cvarWeight = ref(0.5);
const confidenceLevel = ref(0.95);
const solverName = ref<SolverConfig["solver_name"]>("highs");
const timeLimit = ref(60);
const mipRelGap = ref(0.001);
const threads = ref(4);
const presolve = ref(true);

const advancedOpen = ref(false);
const running = ref(false);
const elapsed = ref(0);
let abortController: AbortController | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
onBeforeUnmount(() => timer && clearInterval(timer));
const SOLVER_DEFAULTS = { solverName: "highs" as SolverConfig["solver_name"], timeLimit: 60, mipRelGap: 0.001, threads: 4, presolve: true };
function resetSolver() {
  solverName.value = SOLVER_DEFAULTS.solverName;
  timeLimit.value = SOLVER_DEFAULTS.timeLimit;
  mipRelGap.value = SOLVER_DEFAULTS.mipRelGap;
  threads.value = SOLVER_DEFAULTS.threads;
  presolve.value = SOLVER_DEFAULTS.presolve;
}
const solverIsDefault = computed(
  () => solverName.value === SOLVER_DEFAULTS.solverName && timeLimit.value === SOLVER_DEFAULTS.timeLimit && mipRelGap.value === SOLVER_DEFAULTS.mipRelGap && threads.value === SOLVER_DEFAULTS.threads && presolve.value === SOLVER_DEFAULTS.presolve,
);
const solverSummary = computed(
  () => `${SOLVER_LABEL[solverName.value] ?? solverName.value} · ${timeLimit.value} s limit · ${+(mipRelGap.value * 100).toFixed(2)}% accuracy gap · ${threads.value} threads${solverIsDefault.value ? " (defaults)" : ""}`,
);
const nScenarios = computed(() => selectedScenarioSet.value?.scenarios.length ?? 0);
const tailPct = computed(() => Math.round((1 - confidenceLevel.value) * 100));
const runSummary = computed(() => {
  const parts = [mode.value === "stochastic" ? `Maximize expected profit across ${nScenarios.value} scenarios` : "Maximize profit for a single forecast"];
  if (mode.value === "stochastic" && cvarWeight.value > 0) parts.push(`while also protecting against the worst ${tailPct.value}% of outcomes (weight ${cvarWeight.value.toFixed(2)})`);
  const ss = selectedScenarioSet.value;
  return parts.join(" ") + (ss ? `, over ${ss.number_of_steps * ss.timestep_hours} h.` : ".");
});
const submitted = ref(false);
const initialSnapshot = ref("");
const runError = ref<string | null>(null);

await (async function init() {
  loading.value = true;
  const [pv, ss, runs] = await Promise.all([
    listPortfolioVersions(projectId.value),
    listScenarioSets(projectId.value),
    listRuns(projectId.value),
  ]);
  portfolioVersions.value = pv;
  scenarioSets.value = ss;
  nextDisplayId.value = `R-${String(131 + runs.length).padStart(4, "0")}`;

  const fromId = route.query.from ? Number(route.query.from) : null;
  const portfolioQuery = route.query.portfolio ? Number(route.query.portfolio) : null;

  if (fromId) {
    const run = await getRun(fromId);
    rerunFrom.value = run;
    portfolioVersionId.value = run.portfolio_version_id;
    scenarioSetId.value = run.scenario_set_version_id;
    const ss2 = scenarioSets.value.find((s) => s.id === run.scenario_set_version_id);
    mode.value = ss2?.mode ?? "deterministic";
    if (run.objective.cvar) {
      cvarWeight.value = run.objective.cvar.weight;
      confidenceLevel.value = run.objective.cvar.confidence_level;
    }
    solverName.value = run.solver.solver_name;
    timeLimit.value = run.solver.time_limit ?? 60;
    mipRelGap.value = run.solver.mip_rel_gap ?? 0.001;
    threads.value = run.solver.threads ?? 4;
    presolve.value = run.solver.presolve;
  } else if (portfolioQuery) {
    portfolioVersionId.value = portfolioQuery;
  } else {
    portfolioVersionId.value = portfolioVersions.value.at(-1)?.id ?? null;
  }

  if (!scenarioSetId.value) {
    const match = scenarioSets.value.filter((s) => s.mode === mode.value).at(-1);
    scenarioSetId.value = match?.id ?? scenarioSets.value.at(-1)?.id ?? null;
  }
  loading.value = false;
  initialSnapshot.value = configSnapshot();
})();

const scenarioSetsForMode = computed(() => scenarioSets.value.filter((s) => s.mode === mode.value));

watch(mode, () => {
  const match = scenarioSetsForMode.value.at(-1);
  scenarioSetId.value = match?.id ?? null;
});

// ---- selectable cards: one per name, version chosen inside the card -------------
const portfolioFamilies = computed(() => groupVersions(portfolioVersions.value));
const scenarioFamilies = computed(() => groupVersions(scenarioSetsForMode.value));
// A card shows the selected version if it belongs to the family, else the latest.
function shownVersion<T extends { id: number; name: string; version: number; created_at: string }>(f: VersionFamily<T>, selectedId: number | null) {
  return f.versions.find((v) => v.id === selectedId) ?? f.latest;
}
function pickPortfolio(id: number) { portfolioVersionId.value = id; }
function pickScenarioSet(id: number) { scenarioSetId.value = id; }
function kindSummary(assets: { kind: string }[]) {
  const n: Record<string, number> = {};
  for (const a of assets) n[a.kind] = (n[a.kind] ?? 0) + 1;
  return Object.entries(n).map(([k, c]) => `${c} ${ASSET_KIND_LABEL[k as keyof typeof ASSET_KIND_LABEL].toLowerCase()}${c > 1 ? "s" : ""}`).join(" · ");
}
const scenarioTableOpen = ref(true);
function setSparks(ss: ScenarioSet) {
  const series = ss.scenarios.map((sc) => Object.values(sc.market_prices)[0] ?? []);
  const all = series.flat();
  const min = Math.min(...all), max = Math.max(...all);
  return series.map((v) => sparkPath(v, min, max));
}

const selectedPortfolio = computed(() => portfolioVersions.value.find((p) => p.id === portfolioVersionId.value) ?? null);
const selectedScenarioSet = computed(() => scenarioSets.value.find((s) => s.id === scenarioSetId.value) ?? null);

const probabilitySum = computed(() => {
  if (!selectedScenarioSet.value || selectedScenarioSet.value.mode !== "stochastic") return 1;
  return selectedScenarioSet.value.scenarios.reduce((s, sc) => s + sc.probability, 0);
});

function sparkPath(values: number[] | undefined, lo?: number, hi?: number) {
  if (!values || values.length === 0) return "";
  const min = lo ?? Math.min(...values);
  const max = hi ?? Math.max(...values);
  const span = max - min || 1;
  const stepX = 100 / Math.max(1, values.length - 1);
  return values.map((v, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(1)},${(24 - ((v - min) / span) * 24).toFixed(1)}`).join(" ");
}

// ---- pre-flight checks -----------------------------------------------------
type Check = { label: string; ok: boolean | "warn"; detail?: string };

const checks = computed<Check[]>(() => {
  const list: Check[] = [];
  const pv = selectedPortfolio.value;
  const ss = selectedScenarioSet.value;
  list.push({ label: "Portfolio selected", ok: !!pv });
  list.push({ label: "Scenarios selected", ok: !!ss, detail: ss ? undefined : `No ${mode.value === "stochastic" ? "multi-scenario" : "single-forecast"} sets in this project.` });
  if (ss?.mode === "stochastic") {
    list.push({ label: "Scenario probabilities add up to 100%", ok: Math.abs(probabilitySum.value - 1) < 0.01, detail: `Currently ${Math.round(probabilitySum.value * 100)}%` });
  }
  const socOk = !(pv?.assets ?? []).some(
    (a) => a.kind === "storage" && [a.soc_start, a.soc_end, a.soc_min, a.soc_max].some((v) => v !== null && v !== undefined && (v < 0 || v > 1)),
  );
  list.push({ label: "Battery charge limits are between 0 and 100%", ok: socOk });
  if (ss) {
    const lengths = ss.scenarios.flatMap((sc) => [sc.load_profiles, sc.available_capacity_profiles, sc.market_prices].flatMap((g) => Object.values(g).map((v) => v.length)));
    list.push({ label: `All time series have ${ss.number_of_steps} steps`, ok: lengths.every((n) => n === ss.number_of_steps) });
    if (pv) {
      const loads = pv.assets.filter((a) => a.kind === "load").map((a) => a.name);
      const markets = pv.assets.filter((a) => a.kind === "market").map((a) => a.name);
      const missing = [
        ...loads.filter((n) => ss.scenarios.some((sc) => !(n in sc.load_profiles))).map((n) => `load “${n}”`),
        ...markets.filter((n) => ss.scenarios.some((sc) => !(n in sc.market_prices))).map((n) => `market “${n}”`),
      ];
      list.push({ label: "Scenarios cover every load and market", ok: missing.length === 0 ? true : "warn", detail: missing.length ? `No profile for ${missing.join(", ")}` : undefined });
    }
  }
  if (solverName.value !== "highs") list.push({ label: `${SOLVER_LABEL[solverName.value]} needs its own license`, ok: "warn" });
  return list;
});

const canRun = computed(() => checks.value.every((c) => c.ok !== false) && !running.value && !!portfolioVersionId.value && !!scenarioSetId.value);

// ---- unsaved configuration guard ----------------------------------------------------
function configSnapshot() {
  return JSON.stringify([mode.value, portfolioVersionId.value, scenarioSetId.value, cvarWeight.value, confidenceLevel.value, solverName.value, timeLimit.value, mipRelGap.value, threads.value, presolve.value]);
}
const dirty = computed(() => configSnapshot() !== initialSnapshot.value);
onBeforeRouteLeave(() => {
  if (dirty.value && !running.value && !submitted.value) return window.confirm("Discard this run configuration? It has not been run.");
});

async function runOptimization() {
  if (!portfolioVersionId.value || !scenarioSetId.value) return;
  running.value = true;
  runError.value = null;
  elapsed.value = 0;
  abortController = new AbortController();
  const startedAt = Date.now();
  timer = setInterval(() => (elapsed.value = Math.floor((Date.now() - startedAt) / 1000)), 500);
  const cvar: CVaRConfig | null = mode.value === "stochastic" ? { weight: cvarWeight.value, confidence_level: confidenceLevel.value } : null;
  try {
    const run = await createRun(projectId.value, {
      portfolio_version_id: portfolioVersionId.value,
      scenario_set_version_id: scenarioSetId.value,
      objective: { profit_weight: 1.0, cvar },
      solver: {
        solver_name: solverName.value,
        time_limit: timeLimit.value,
        mip_rel_gap: mipRelGap.value,
        threads: threads.value,
        presolve: presolve.value,
      },
      rerun_from_run_id: rerunFrom.value?.id ?? null,
    }, abortController.signal);
    submitted.value = true;
    await useProjectsState().refresh();
    toast.add({ title: `${run.display_id} ${runStatus(run.status).label.toLowerCase()}`, color: run.status === "optimal" ? "success" : "warning", icon: runStatus(run.status).icon });
    router.push(`/p/${projectId.value}/runs/${run.id}`);
  } catch (e: any) {
    if (abortController?.signal.aborted) {
      toast.add({ title: "Stopped waiting for the result", description: "If the server already finished, the run will appear in your Runs list.", color: "neutral", icon: "i-lucide-circle-slash" });
      return;
    }
    const d = e?.data?.detail;
    runError.value = Array.isArray(d) ? d.map((x: any) => `${(x.loc ?? []).slice(1).join(".")}: ${x.msg}`).join("; ") : typeof d === "string" ? d : "Failed to run optimization. Check that the backend is running.";
  } finally {
    running.value = false;
    if (timer) clearInterval(timer);
    timer = null;
    abortController = null;
  }
}

function cancelRun() {
  abortController?.abort();
}

const fmtElapsed = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <PageHeader :crumbs="[{ label: 'Runs', to: `/p/${projectId}/runs` }, { label: 'New run' }]">
        <template #meta>
          <span class="font-mono text-xs text-muted">{{ nextDisplayId }}</span>
          <UBadge v-if="dirty" color="warning" variant="subtle" size="sm" label="Unsaved configuration" />
        </template>
      </PageHeader>
    </template>

    <template #body>
      <PageSkeleton v-if="loading" :rows="4" />
      <div v-else class="flex max-w-[1280px] flex-wrap items-start gap-5">
        <div class="flex min-w-0 flex-1 basis-[560px] flex-col gap-4" :class="running ? 'pointer-events-none opacity-60' : ''" :inert="running">
          <UAlert
            v-if="rerunFrom"
            color="info"
            variant="subtle"
            icon="i-lucide-rotate-cw"
            :description="`Configuration loaded from ${rerunFrom.display_id}. Running creates a new run; ${rerunFrom.display_id} stays unchanged.`"
          />

          <!-- 1. Inputs: portfolio -->
          <Panel title="1 · Portfolio" description="The plants, batteries, demand and markets to schedule">
            <template #actions>
              <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-pencil" label="Edit portfolio" :to="`/p/${projectId}/portfolio`" />
            </template>
            <div v-if="portfolioFamilies.length" role="radiogroup" aria-label="Portfolio" class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SelectableCard
                v-for="f in portfolioFamilies"
                :key="f.name"
                :title="f.name"
                :versions="f.versions"
                :version-id="shownVersion(f, portfolioVersionId).id"
                :active="f.versions.some((v) => v.id === portfolioVersionId)"
                :subtitle="kindSummary(shownVersion(f, portfolioVersionId).assets)"
                @select="pickPortfolio(shownVersion(f, portfolioVersionId).id)"
                @update:version-id="(id) => pickPortfolio(id)"
              >
                <ul class="flex flex-wrap gap-1.5">
                  <li
                    v-for="a in shownVersion(f, portfolioVersionId).assets"
                    :key="a.name"
                    class="inline-flex items-center gap-1.5 rounded-md border border-muted bg-muted px-2 py-1 text-xs text-default"
                  >
                    <span class="size-2 rounded-sm" :style="{ background: a.color || ASSET_DEFAULT_COLOR[a.kind] }" />
                    {{ a.name }}
                    <span class="text-toned">{{ ASSET_KIND_LABEL[a.kind] }}</span>
                  </li>
                </ul>
              </SelectableCard>
            </div>
            <EmptyState v-else icon="i-lucide-boxes" title="No portfolio yet" description="Create a portfolio before running an optimization.">
              <UButton label="Open portfolio" :to="`/p/${projectId}/portfolio`" />
            </EmptyState>
          </Panel>

          <!-- 2. Inputs: scenarios -->
          <Panel title="2 · Scenarios" description="Forecasts of demand, available capacity and market prices">
            <template #actions>
              <SegmentedControl
                v-model="mode"
                label="Scenario type"
                :items="[
                  { value: 'deterministic', label: 'Single forecast', hint: 'Deterministic: one scenario, solved on its own' },
                  { value: 'stochastic', label: 'Several scenarios', hint: 'Stochastic: weighted scenarios, optimized together' },
                ]"
              />
            </template>
            <div class="flex flex-col gap-4">
              <div v-if="scenarioFamilies.length" role="radiogroup" aria-label="Scenario set" class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SelectableCard
                  v-for="f in scenarioFamilies"
                  :key="f.name"
                  :title="f.name"
                  :versions="f.versions"
                  :version-id="shownVersion(f, scenarioSetId).id"
                  :active="f.versions.some((v) => v.id === scenarioSetId)"
                  :subtitle="`${shownVersion(f, scenarioSetId).scenarios.length} ${shownVersion(f, scenarioSetId).scenarios.length === 1 ? 'scenario' : 'scenarios'} · ${shownVersion(f, scenarioSetId).number_of_steps * shownVersion(f, scenarioSetId).timestep_hours} h horizon`"
                  @select="pickScenarioSet(shownVersion(f, scenarioSetId).id)"
                  @update:version-id="(id) => pickScenarioSet(id)"
                >
                  <svg viewBox="0 0 100 24" preserveAspectRatio="none" class="h-8 w-full" role="img" aria-label="Market price profiles">
                    <path v-for="(d, i) in setSparks(shownVersion(f, scenarioSetId))" :key="i" :d="d" fill="none" stroke="#6a70a8" stroke-width="1.5" stroke-opacity="0.6" vector-effect="non-scaling-stroke" />
                  </svg>
                  <span class="text-xs text-toned">
                    {{ shownVersion(f, scenarioSetId).timestep_hours }} h steps<template v-if="mode === 'stochastic'"> · probabilities total {{ fmtPct(shownVersion(f, scenarioSetId).scenarios.reduce((t, sc) => t + sc.probability, 0)) }}</template>
                  </span>
                </SelectableCard>
                <button
                  type="button"
                  class="flex min-h-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-accented text-sm text-toned transition-colors hover:border-primary hover:text-highlighted"
                  @click="scenarioEditorOpen = true"
                >
                  <UIcon name="i-lucide-plus" class="size-4" />
                  New scenario set
                </button>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <UButton
                  v-if="selectedScenarioSet"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :icon="scenarioTableOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                  :label="`${scenarioTableOpen ? 'Hide' : 'Show'} scenarios in ${selectedScenarioSet.name} v${selectedScenarioSet.version}`"
                  :aria-expanded="scenarioTableOpen"
                  @click="scenarioTableOpen = !scenarioTableOpen"
                />
                <UButton label="Manage scenarios" size="xs" icon="i-lucide-external-link" color="neutral" variant="ghost" class="ml-auto" :to="`/p/${projectId}/scenarios`" />
              </div>

              <div v-if="selectedScenarioSet && scenarioTableOpen" class="overflow-x-auto rounded-md border border-muted">
                <table class="w-full min-w-[560px] text-sm">
                  <thead class="bg-ink-950/[0.05] dark:bg-black/25 text-left text-xs font-semibold text-toned">
                    <tr>
                      <th class="px-3 py-2">Scenario</th>
                      <th class="px-3 py-2 text-right">Probability</th>
                      <th class="px-3 py-2">Market price</th>
                      <th class="px-3 py-2">Available capacity</th>
                      <th class="px-3 py-2">Load</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="sc in selectedScenarioSet.scenarios" :key="sc.name" class="border-t border-muted">
                      <td class="px-3 py-2 text-highlighted">{{ sc.name }}</td>
                      <td class="px-3 py-2 text-right font-mono">{{ selectedScenarioSet.mode === "stochastic" ? fmtPct(sc.probability) : "—" }}</td>
                      <td class="px-3 py-2"><svg viewBox="0 0 100 24" preserveAspectRatio="none" class="h-6 w-full min-w-20" role="img" aria-label="Market price profile"><path :d="sparkPath(Object.values(sc.market_prices)[0])" fill="none" stroke="#6a70a8" stroke-width="1.5" vector-effect="non-scaling-stroke" /></svg></td>
                      <td class="px-3 py-2"><svg viewBox="0 0 100 24" preserveAspectRatio="none" class="h-6 w-full min-w-20" role="img" aria-label="Available capacity profile"><path :d="sparkPath(Object.values(sc.available_capacity_profiles)[0])" fill="none" stroke="#81b29a" stroke-width="1.5" vector-effect="non-scaling-stroke" /></svg></td>
                      <td class="px-3 py-2"><svg viewBox="0 0 100 24" preserveAspectRatio="none" class="h-6 w-full min-w-20" role="img" aria-label="Load profile"><path :d="sparkPath(Object.values(sc.load_profiles)[0])" fill="none" stroke="#8d90a8" stroke-width="1.5" vector-effect="non-scaling-stroke" /></svg></td>
                    </tr>
                    <tr v-if="selectedScenarioSet.mode === 'stochastic'" class="border-t border-muted bg-muted text-xs">
                      <td class="px-3 py-2 text-toned">Total probability</td>
                      <td class="px-3 py-2 text-right font-mono font-semibold" :class="Math.abs(probabilitySum - 1) < 0.01 ? 'text-success' : 'text-error'">{{ fmtPct(probabilitySum) }}</td>
                      <td colspan="3" />
                    </tr>
                  </tbody>
                </table>
              </div>
              <EmptyState v-else-if="!scenarioFamilies.length" icon="i-lucide-chart-spline" :title="mode === 'stochastic' ? 'No multi-scenario sets yet' : 'No single-forecast sets yet'" description="A scenario set holds the demand, market prices and generator availability the optimizer plans against.">
                <UButton label="Create scenario set" icon="i-lucide-plus" @click="scenarioEditorOpen = true" />
              </EmptyState>
              <p class="text-xs text-toned">
                {{ mode === "stochastic" ? "One schedule is optimized across all scenarios, weighted by probability." : "A single forecast is solved on its own; there is no uncertainty to hedge against." }}
                Charts show the first series of each type.
              </p>
            </div>
          </Panel>

          <!-- 3. Assumptions: objective -->
          <Panel title="3 · Risk preference" description="How cautious the schedule should be about bad outcomes">
            <div class="flex flex-col gap-3">
              <fieldset :disabled="mode === 'deterministic'" class="flex flex-col gap-4">
                <UFormField label="Risk aversion" :description="mode === 'deterministic' ? 'Needs several scenarios: a single forecast has no uncertainty to hedge against.' : `Weight ${cvarWeight.toFixed(2)} on avoiding the worst outcomes`" title="odys: CVaRTerm.weight">
                  <USlider v-model="cvarWeight" :min="0" :max="4" :step="0.25" :disabled="mode === 'deterministic'" aria-label="Risk aversion" />
                  <div class="mt-1 flex justify-between text-xs text-toned"><span>Maximize average profit</span><span>Strongly avoid bad outcomes</span></div>
                </UFormField>
                <UFormField v-if="mode === 'stochastic'" label="Bad-outcome range" :description="`Risk protection focuses on the worst ${tailPct}% of outcomes`" title="odys: CVaR confidence level">
                  <SegmentedControl v-model="confidenceLevel" label="Bad-outcome range" :items="[{ value: 0.9, label: 'Worst 10%' }, { value: 0.95, label: 'Worst 5%' }, { value: 0.99, label: 'Worst 1%' }]" />
                </UFormField>
              </fieldset>
            </div>
          </Panel>

          <!-- 4. Advanced: solver -->
          <div class="rounded-lg border border-default bg-default">
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left"
              :aria-expanded="advancedOpen"
              aria-controls="advanced-solver"
              @click="advancedOpen = !advancedOpen"
            >
              <UIcon name="i-lucide-sliders-horizontal" class="size-4 shrink-0 text-toned" />
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="text-sm font-semibold text-highlighted">Advanced solver settings</span>
                <span class="truncate text-xs text-toned">{{ solverSummary }}</span>
              </span>
              <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 text-toned transition-transform" :class="advancedOpen ? 'rotate-180' : ''" />
            </button>
            <div v-if="advancedOpen" id="advanced-solver" class="flex flex-col gap-4 border-t border-muted p-4">
              <p class="text-xs text-toned">The defaults suit most runs. Change these only if a run is slow or you need a tighter answer.</p>
              <SegmentedControl
                v-model="solverName"
                label="Solver"
                :items="[
                  { value: 'highs', label: 'HiGHS', hint: 'Open source (default)' },
                  { value: 'scip', label: 'SCIP' },
                  { value: 'gurobi', label: 'Gurobi', hint: 'Commercial: requires a license' },
                  { value: 'cplex', label: 'CPLEX', hint: 'Commercial: requires a license' },
                ]"
              />
              <UAlert
                v-if="solverName === 'gurobi' || solverName === 'cplex'"
                color="warning"
                variant="subtle"
                icon="i-lucide-key-round"
                :description="`${SOLVER_LABEL[solverName]} is commercial and needs its own license. It can't run on shared cloud workers without a license server.`"
              />
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <UFormField label="Time limit" description="Seconds before the solver stops with its best schedule so far" title="odys: time_limit"><UInputNumber v-model="timeLimit" class="w-full" :min="1" /></UFormField>
                <UFormField label="Accuracy gap" description="Stop once proven this close to the best possible (0.001 = 0.1%)" title="odys: mip_rel_gap"><UInputNumber v-model="mipRelGap" class="w-full" :step="0.001" :min="0" :max="1" /></UFormField>
                <UFormField label="Threads" description="Parallel solver threads" title="odys: threads"><UInputNumber v-model="threads" class="w-full" :min="1" /></UFormField>
                <UFormField label="Presolve" description="Simplify the problem before solving" title="odys: presolve"><USwitch v-model="presolve" /></UFormField>
              </div>
              <UButton v-if="!solverIsDefault" class="self-start" size="xs" color="neutral" variant="ghost" icon="i-lucide-rotate-ccw" label="Reset to defaults" @click="resetSolver" />
            </div>
          </div>
        </div>

        <!-- Summary + run -->
        <aside class="pointer-events-auto flex basis-[300px] flex-col gap-4 sm:sticky sm:top-0 sm:max-w-[380px]" aria-label="Run summary">
          <Panel title="What will be solved">
            <div class="flex flex-col gap-3">
              <p class="text-sm text-default">{{ runSummary }}</p>

              <dl class="flex flex-col gap-1.5 text-sm">
                <div class="flex justify-between"><dt class="text-toned">Horizon</dt><dd class="font-mono">{{ selectedScenarioSet ? `${selectedScenarioSet.number_of_steps} × ${selectedScenarioSet.timestep_hours} h` : "—" }}</dd></div>
                <div class="flex justify-between"><dt class="text-toned">Scenarios</dt><dd class="font-mono">{{ selectedScenarioSet?.scenarios.length ?? "—" }}</dd></div>
                <div class="flex justify-between"><dt class="text-toned">Assets</dt><dd class="font-mono">{{ selectedPortfolio?.assets.length ?? "—" }}</dd></div>
                <div class="flex justify-between"><dt class="text-toned">Solver</dt><dd class="font-mono">{{ SOLVER_LABEL[solverName] }}</dd></div>
              </dl>

              <ul class="flex flex-col gap-1.5 border-t border-muted pt-3" aria-label="Pre-flight checks">
                <li v-for="c in checks" :key="c.label" class="flex items-start gap-2 text-xs">
                  <UIcon
                    :name="c.ok === true ? 'i-lucide-circle-check' : c.ok === 'warn' ? 'i-lucide-triangle-alert' : 'i-lucide-circle-x'"
                    class="mt-px size-3.5 shrink-0"
                    :class="c.ok === true ? 'text-success' : c.ok === 'warn' ? 'text-warning' : 'text-error'"
                  />
                  <span :class="c.ok === false ? 'text-error' : 'text-toned'">
                    {{ c.label }}<span v-if="c.detail && c.ok !== true" class="block text-muted">{{ c.detail }}</span>
                  </span>
                </li>
              </ul>

              <UAlert v-if="runError" color="error" variant="subtle" icon="i-lucide-circle-alert" title="Run failed" :description="runError" />
              <div v-if="running" class="flex flex-col gap-2 rounded-md bg-info/10 p-3 text-sm" role="status" aria-live="polite">
                <div class="flex items-center gap-2 font-medium text-highlighted">
                  <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin text-info" />
                  {{ nScenarios > 1 ? `Solving ${nScenarios} scenarios…` : "Solving…" }}
                  <span class="ml-auto font-mono text-toned">{{ fmtElapsed(elapsed) }}</span>
                </div>
                <span class="text-xs text-toned">Using {{ SOLVER_LABEL[solverName] }}, up to {{ timeLimit }} s. You'll be taken to the results when it finishes.</span>
              </div>

              <UButton v-if="!running" block size="lg" icon="i-lucide-play" :disabled="!canRun" label="Run optimization" @click="runOptimization" />
              <UButton v-else block size="lg" color="neutral" variant="outline" icon="i-lucide-square" label="Cancel" @click="cancelRun" />
              <span v-if="!running" class="text-center text-xs text-muted">Saved as an immutable run in this project's history</span>
            </div>
          </Panel>
        </aside>
      </div>
      <ScenarioSetSlideover
        v-model:open="scenarioEditorOpen"
        :project-id="projectId"
        :portfolio="selectedPortfolio ?? portfolioVersions.at(-1) ?? null"
        :default-mode="mode"
        @created="onScenarioSetCreated"
      />
    </template>
  </UDashboardPanel>
</template>
