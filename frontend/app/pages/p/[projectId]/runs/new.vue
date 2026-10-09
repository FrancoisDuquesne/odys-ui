<script setup lang="ts">
import type { CVaRConfig, PortfolioVersion, Run, ScenarioSet, SolverConfig } from "~/types";

const route = useRoute();
const router = useRouter();
const projectId = computed(() => Number(route.params.projectId));
const toast = useToast();
const { listPortfolioVersions } = usePortfolio();
const { listScenarioSets } = useScenarioSets();
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

const running = ref(false);
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

const selectedPortfolio = computed(() => portfolioVersions.value.find((p) => p.id === portfolioVersionId.value) ?? null);
const selectedScenarioSet = computed(() => scenarioSets.value.find((s) => s.id === scenarioSetId.value) ?? null);

const probabilitySum = computed(() => {
  if (!selectedScenarioSet.value || selectedScenarioSet.value.mode !== "stochastic") return 1;
  return selectedScenarioSet.value.scenarios.reduce((s, sc) => s + sc.probability, 0);
});

function sparkPath(values: number[] | undefined) {
  if (!values || values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
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
  list.push({ label: "Scenario set selected", ok: !!ss, detail: ss ? undefined : `No ${mode.value} scenario sets in this project.` });
  if (ss?.mode === "stochastic") {
    list.push({ label: "Probabilities sum to 1.00", ok: Math.abs(probabilitySum.value - 1) < 0.01, detail: `Σ = ${probabilitySum.value.toFixed(2)}` });
  }
  const socOk = !(pv?.assets ?? []).some(
    (a) => a.kind === "storage" && [a.soc_start, a.soc_end, a.soc_min, a.soc_max].some((v) => v !== null && v !== undefined && (v < 0 || v > 1)),
  );
  list.push({ label: "Storage SoC bounds are fractions in [0, 1]", ok: socOk });
  if (ss) {
    const lengths = ss.scenarios.flatMap((sc) => [sc.load_profiles, sc.available_capacity_profiles, sc.market_prices].flatMap((g) => Object.values(g).map((v) => v.length)));
    list.push({ label: `All profiles have ${ss.number_of_steps} steps`, ok: lengths.every((n) => n === ss.number_of_steps) });
    if (pv) {
      const loads = pv.assets.filter((a) => a.kind === "load").map((a) => a.name);
      const markets = pv.assets.filter((a) => a.kind === "market").map((a) => a.name);
      const missing = [
        ...loads.filter((n) => ss.scenarios.some((sc) => !(n in sc.load_profiles))).map((n) => `load “${n}”`),
        ...markets.filter((n) => ss.scenarios.some((sc) => !(n in sc.market_prices))).map((n) => `market “${n}”`),
      ];
      list.push({ label: "Scenario profiles cover portfolio assets", ok: missing.length === 0 ? true : "warn", detail: missing.length ? `No profile for ${missing.join(", ")}` : undefined });
    }
  }
  if (solverName.value !== "highs") list.push({ label: `${solverName.value.toUpperCase()} needs its own license`, ok: "warn" });
  return list;
});

const canRun = computed(() => checks.value.every((c) => c.ok !== false) && !running.value);

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
    });
    submitted.value = true;
    await useProjectsState().refresh();
    toast.add({ title: `${run.display_id} ${runStatus(run.status).label.toLowerCase()}`, color: run.status === "optimal" ? "success" : "warning", icon: runStatus(run.status).icon });
    router.push(`/p/${projectId.value}/runs/${run.id}`);
  } catch (e: any) {
    const d = e?.data?.detail;
    runError.value = Array.isArray(d) ? d.map((x: any) => `${(x.loc ?? []).slice(1).join(".")}: ${x.msg}`).join("; ") : typeof d === "string" ? d : "Failed to run optimization. Check that the backend is running.";
  } finally {
    running.value = false;
  }
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <PageHeader :crumbs="[{ label: 'Runs', to: `/p/${projectId}/runs` }, { label: 'New run' }]">
        <template #meta>
          <span class="font-mono text-xs text-dimmed">{{ nextDisplayId }}</span>
          <UBadge v-if="dirty" color="warning" variant="subtle" size="sm" label="Unsaved configuration" />
        </template>
      </PageHeader>
    </template>

    <template #body>
      <PageSkeleton v-if="loading" :rows="4" />
      <div v-else class="flex max-w-[1280px] flex-wrap items-start gap-5">
        <div class="flex min-w-0 flex-1 basis-[560px] flex-col gap-4">
          <UAlert
            v-if="rerunFrom"
            color="info"
            variant="subtle"
            icon="i-lucide-rotate-cw"
            :description="`Configuration loaded from ${rerunFrom.display_id}. Running creates a new run; ${rerunFrom.display_id} stays unchanged.`"
          />

          <!-- 1. Inputs: portfolio -->
          <Panel title="1 · Portfolio" description="The assets to dispatch (AssetPortfolio)">
            <template #actions>
              <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-pencil" label="Edit portfolio" :to="`/p/${projectId}/portfolio`" />
            </template>
            <div class="flex flex-col gap-3">
              <UFormField label="Version">
                <USelectMenu
                  v-model="portfolioVersionId"
                  :items="portfolioVersions.map((p) => ({ label: `${p.name} · v${p.version} · ${p.assets.length} assets`, value: p.id }))"
                  value-key="value"
                  class="w-full max-w-sm"
                />
              </UFormField>
              <ul class="flex flex-wrap gap-1.5">
                <li
                  v-for="a in selectedPortfolio?.assets ?? []"
                  :key="a.name"
                  class="inline-flex items-center gap-1.5 rounded-md border border-muted bg-muted px-2 py-1 text-xs text-default"
                >
                  <span class="size-2 rounded-sm" :style="{ background: a.color || ASSET_DEFAULT_COLOR[a.kind] }" />
                  {{ a.name }}
                  <span class="text-dimmed">{{ ASSET_KIND_LABEL[a.kind] }}</span>
                </li>
              </ul>
              <EmptyState v-if="portfolioVersions.length === 0" icon="i-lucide-boxes" title="No portfolio yet" description="Create a portfolio before running an optimization.">
                <UButton label="Open portfolio" :to="`/p/${projectId}/portfolio`" />
              </EmptyState>
            </div>
          </Panel>

          <!-- 2. Inputs: scenarios -->
          <Panel title="2 · Scenarios" description="Time series for load, available capacity and market prices">
            <template #actions>
              <SegmentedControl
                v-model="mode"
                label="Scenario type"
                :items="[
                  { value: 'deterministic', label: 'Deterministic', hint: 'A single Scenario' },
                  { value: 'stochastic', label: 'Stochastic', hint: 'A set of StochasticScenarios with probabilities' },
                ]"
              />
            </template>
            <div class="flex flex-col gap-4">
              <div class="flex flex-wrap items-end gap-3">
                <UFormField label="Scenario set">
                  <USelectMenu
                    v-model="scenarioSetId"
                    :items="scenarioSetsForMode.map((s) => ({ label: `${s.name} · v${s.version}`, value: s.id }))"
                    value-key="value"
                    class="w-64"
                    :placeholder="`No ${mode} sets`"
                  />
                </UFormField>
                <span v-if="selectedScenarioSet" class="pb-2 text-xs text-muted">
                  {{ selectedScenarioSet.number_of_steps }} steps × {{ selectedScenarioSet.timestep_hours }} h = {{ selectedScenarioSet.number_of_steps * selectedScenarioSet.timestep_hours }} h horizon
                </span>
              </div>

              <div v-if="selectedScenarioSet" class="overflow-x-auto rounded-md border border-muted">
                <table class="w-full min-w-[560px] text-sm">
                  <thead class="bg-muted text-left text-xs font-semibold text-muted">
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
                      <td class="px-3 py-2 text-right font-mono">{{ selectedScenarioSet.mode === "stochastic" ? sc.probability.toFixed(2) : "—" }}</td>
                      <td class="px-3 py-2"><svg viewBox="0 0 100 24" preserveAspectRatio="none" class="h-6 w-full min-w-20" role="img" aria-label="Market price profile"><path :d="sparkPath(Object.values(sc.market_prices)[0])" fill="none" stroke="#6366f1" stroke-width="1.5" vector-effect="non-scaling-stroke" /></svg></td>
                      <td class="px-3 py-2"><svg viewBox="0 0 100 24" preserveAspectRatio="none" class="h-6 w-full min-w-20" role="img" aria-label="Available capacity profile"><path :d="sparkPath(Object.values(sc.available_capacity_profiles)[0])" fill="none" stroke="#0ea5e9" stroke-width="1.5" vector-effect="non-scaling-stroke" /></svg></td>
                      <td class="px-3 py-2"><svg viewBox="0 0 100 24" preserveAspectRatio="none" class="h-6 w-full min-w-20" role="img" aria-label="Load profile"><path :d="sparkPath(Object.values(sc.load_profiles)[0])" fill="none" stroke="#475569" stroke-width="1.5" vector-effect="non-scaling-stroke" /></svg></td>
                    </tr>
                    <tr v-if="selectedScenarioSet.mode === 'stochastic'" class="border-t border-muted bg-muted text-xs">
                      <td class="px-3 py-2 text-muted">Σ probability</td>
                      <td class="px-3 py-2 text-right font-mono font-semibold" :class="Math.abs(probabilitySum - 1) < 0.01 ? 'text-success' : 'text-error'">{{ probabilitySum.toFixed(2) }}</td>
                      <td colspan="3" />
                    </tr>
                  </tbody>
                </table>
              </div>
              <EmptyState v-else icon="i-lucide-chart-spline" :title="`No ${mode} scenario sets`" :description="mode === 'stochastic' ? 'Switch to Deterministic, or add a stochastic scenario set.' : 'Switch to Stochastic, or add a deterministic scenario set.'" />
              <p class="text-xs text-muted">
                {{ mode === "stochastic" ? "odys solves one MILP that is jointly optimal across all scenarios, weighted by probability." : "A single scenario is solved on its own; there is no uncertainty to hedge against." }}
                Sparklines show the first series of each type.
              </p>
            </div>
          </Panel>

          <!-- 3. Assumptions: objective -->
          <Panel title="3 · Objective & risk" description="What the solver maximizes (Objective)">
            <div class="flex flex-col gap-4">
              <UAlert v-if="mode === 'deterministic'" color="neutral" variant="subtle" icon="i-lucide-info" description="Risk preferences apply to stochastic scenarios only. With a single deterministic scenario there is no distribution to be risk-averse about, so the solver maximizes profit." />
              <fieldset :disabled="mode === 'deterministic'" class="flex flex-col gap-4 disabled:opacity-50">
                <UFormField label="Profit weight" description="ProfitTerm.weight — fixed at 1.0">
                  <span class="font-mono text-sm">1.0</span>
                </UFormField>
                <UFormField label="CVaR weight" :description="`CVaRTerm.weight — currently ${cvarWeight.toFixed(2)}`">
                  <USlider v-model="cvarWeight" :min="0" :max="4" :step="0.25" :disabled="mode === 'deterministic'" />
                  <div class="mt-1 flex justify-between text-xs text-dimmed"><span>0 · risk-neutral</span><span>4 · strongly risk-averse</span></div>
                </UFormField>
                <UFormField label="Confidence level" :description="`The tail is the worst ${Math.round((1 - confidenceLevel) * 100)}% of probability mass`">
                  <SegmentedControl v-model="confidenceLevel" label="Confidence level" :items="[{ value: 0.9, label: '90%' }, { value: 0.95, label: '95%' }, { value: 0.99, label: '99%' }]" />
                </UFormField>
              </fieldset>
            </div>
          </Panel>

          <!-- 4. Solver -->
          <Panel title="4 · Solver" description="Engine and tolerances (SolverConfig)">
            <div class="flex flex-col gap-4">
              <SegmentedControl
                v-model="solverName"
                label="Solver"
                :items="[
                  { value: 'highs', label: 'HiGHS', hint: 'Open source (default)' },
                  { value: 'scip', label: 'SCIP' },
                  { value: 'gurobi', label: 'Gurobi', hint: 'Commercial — requires a license' },
                  { value: 'cplex', label: 'CPLEX', hint: 'Commercial — requires a license' },
                ]"
              />
              <UAlert
                v-if="solverName === 'gurobi' || solverName === 'cplex'"
                color="warning"
                variant="subtle"
                icon="i-lucide-key-round"
                :description="`${solverName.toUpperCase()} is commercial and needs its own license. It can't run on shared cloud workers without a license server.`"
              />
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <UFormField label="Time limit" description="Seconds before the solver stops with its best feasible schedule"><UInputNumber v-model="timeLimit" class="w-full" :min="1" /></UFormField>
                <UFormField label="MIP relative gap" description="Stop when proven within this fraction of optimal (0 – 1)"><UInputNumber v-model="mipRelGap" class="w-full" :step="0.001" :min="0" :max="1" /></UFormField>
                <UFormField label="Threads" description="Parallel solver threads"><UInputNumber v-model="threads" class="w-full" :min="1" /></UFormField>
                <UFormField label="Presolve" description="Simplify the model before solving"><USwitch v-model="presolve" /></UFormField>
              </div>
            </div>
          </Panel>
        </div>

        <!-- Summary + run -->
        <aside class="flex basis-[300px] flex-col gap-4 sm:sticky sm:top-4 sm:max-w-[380px]" aria-label="Run summary">
          <Panel title="What will be solved">
            <div class="flex flex-col gap-3">
              <pre class="overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed text-default">maximize  1.0 · E[profit]<template v-if="mode === 'stochastic'">
        + {{ cvarWeight.toFixed(2) }} · CVaR{{ Math.round(confidenceLevel * 100) }}(profit)</template>

<template v-if="mode === 'stochastic'">E[profit] = Σₛ pₛ · profitₛ
over {{ selectedScenarioSet?.scenarios.length ?? 0 }} scenarios</template><template v-else>single scenario “{{ selectedScenarioSet?.scenarios[0]?.name ?? "—" }}”</template></pre>

              <dl class="flex flex-col gap-1.5 text-sm">
                <div class="flex justify-between"><dt class="text-muted">Horizon</dt><dd class="font-mono">{{ selectedScenarioSet ? `${selectedScenarioSet.number_of_steps} × ${selectedScenarioSet.timestep_hours} h` : "—" }}</dd></div>
                <div class="flex justify-between"><dt class="text-muted">Scenarios</dt><dd class="font-mono">{{ selectedScenarioSet?.scenarios.length ?? "—" }}</dd></div>
                <div class="flex justify-between"><dt class="text-muted">Assets</dt><dd class="font-mono">{{ selectedPortfolio?.assets.length ?? "—" }}</dd></div>
                <div class="flex justify-between"><dt class="text-muted">Solver</dt><dd class="font-mono uppercase">{{ solverName }}</dd></div>
              </dl>

              <ul class="flex flex-col gap-1.5 border-t border-muted pt-3" aria-label="Pre-flight checks">
                <li v-for="c in checks" :key="c.label" class="flex items-start gap-2 text-xs">
                  <UIcon
                    :name="c.ok === true ? 'i-lucide-circle-check' : c.ok === 'warn' ? 'i-lucide-triangle-alert' : 'i-lucide-circle-x'"
                    class="mt-px size-3.5 shrink-0"
                    :class="c.ok === true ? 'text-success' : c.ok === 'warn' ? 'text-warning' : 'text-error'"
                  />
                  <span :class="c.ok === false ? 'text-error' : 'text-muted'">
                    {{ c.label }}<span v-if="c.detail && c.ok !== true" class="block text-dimmed">{{ c.detail }}</span>
                  </span>
                </li>
              </ul>

              <UAlert v-if="runError" color="error" variant="subtle" icon="i-lucide-circle-alert" title="Run failed" :description="runError" />
              <UAlert v-if="running" color="info" variant="subtle" icon="i-lucide-loader-circle" :title="`Solving with ${solverName.toUpperCase()}…`" :description="`Up to ${timeLimit}s. You'll be taken to the results when it finishes.`" :ui="{ icon: 'animate-spin' }" />

              <UButton block size="lg" icon="i-lucide-play" :loading="running" :disabled="!canRun" :label="running ? 'Solving…' : 'Run optimization'" @click="runOptimization" />
              <span class="text-center text-xs text-dimmed">Saved as an immutable run in this project's history</span>
            </div>
          </Panel>
        </aside>
      </div>
    </template>
  </UDashboardPanel>
</template>
