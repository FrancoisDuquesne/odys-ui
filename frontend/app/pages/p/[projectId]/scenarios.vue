<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { PortfolioVersion, Run, ScenarioDef, ScenarioSet } from "~/types";

const route = useRoute();
const router = useRouter();
const projectId = computed(() => Number(route.params.projectId));
const { currentProject } = useCurrentProject();
const { listScenarioSets, createScenarioSet, uploadScenarioCsv } = useScenarioSets();
const { listPortfolioVersions } = usePortfolio();
const { listRuns } = useRuns();
const toast = useToast();

const sets = ref<ScenarioSet[]>([]);
const runs = ref<Run[]>([]);
const portfolio = ref<PortfolioVersion | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const [ss, rs, pv] = await Promise.all([listScenarioSets(projectId.value), listRuns(projectId.value), listPortfolioVersions(projectId.value)]);
    sets.value = ss;
    runs.value = rs;
    portfolio.value = pv.at(-1) ?? null;
  } catch {
    loadError.value = "Could not load the scenario sets.";
  } finally {
    loading.value = false;
  }
}
await load();

// ---- families: every saved version of a set shares its name -------------------
interface Family {
  name: string;
  versions: ScenarioSet[];
  latest: ScenarioSet;
}
const families = computed<Family[]>(() => {
  const byName = new Map<string, ScenarioSet[]>();
  for (const s of sets.value) byName.set(s.name, [...(byName.get(s.name) ?? []), s]);
  return [...byName.entries()]
    .map(([name, versions]) => {
      const sorted = [...versions].sort((a, b) => a.version - b.version);
      return { name, versions: sorted, latest: sorted.at(-1)! };
    })
    .sort((a, b) => b.latest.created_at.localeCompare(a.latest.created_at));
});

const runCount = (id: number) => runs.value.filter((r) => r.scenario_set_version_id === id).length;

const selectedName = ref<string | null>(typeof route.query.set === "string" ? route.query.set : null);
const selectedVersionId = ref<number | null>(null);
const family = computed(() => families.value.find((f) => f.name === selectedName.value) ?? families.value[0] ?? null);
const selected = computed<ScenarioSet | null>(() => family.value?.versions.find((v) => v.id === selectedVersionId.value) ?? family.value?.latest ?? null);
const isLatest = computed(() => !!selected.value && selected.value.id === family.value?.latest.id);

function pick(f: Family) {
  selectedName.value = f.name;
  selectedVersionId.value = null;
  router.replace({ query: { ...route.query, set: f.name } });
}

const usedBy = computed(() => (selected.value ? runs.value.filter((r) => r.scenario_set_version_id === selected.value!.id) : []));

// ---- charts ------------------------------------------------------------------
const SCENARIO_COLORS = ["#5f9a80", "#e07a5f", "#6a70a8", "#e9b45e", "#a07bb0", "#8d90a8"];
type ProfileKey = "load_profiles" | "market_prices" | "available_capacity_profiles";

function profileCharts(key: ProfileKey) {
  const sc = selected.value?.scenarios ?? [];
  const names = [...new Set(sc.flatMap((s) => Object.keys(s[key])))];
  return names.map((asset) => ({
    asset,
    series: sc
      .filter((s) => s[key][asset])
      .map((s, i) => ({ name: s.name, color: SCENARIO_COLORS[sc.indexOf(s) % SCENARIO_COLORS.length]!, data: s[key][asset]! })),
  }));
}
const sections = computed(() =>
  [
    { key: "load_profiles" as const, title: "Demand", unit: "MW", icon: "i-lucide-plug" },
    { key: "market_prices" as const, title: "Market price", unit: "$/MWh", icon: "i-lucide-trending-up" },
    { key: "available_capacity_profiles" as const, title: "Generator availability", unit: "MW", icon: "i-lucide-zap" },
  ]
    .map((s) => ({ ...s, charts: profileCharts(s.key) }))
    .filter((s) => s.charts.length > 0),
);

const mean = (v: number[]) => (v.length ? sum(v) / v.length : 0);
function scenarioStats(sc: ScenarioDef) {
  const first = (r: Record<string, number[]>) => Object.values(r)[0];
  const load = first(sc.load_profiles);
  const price = first(sc.market_prices);
  return {
    avgLoad: load ? mean(load) : null,
    peakLoad: load ? Math.max(...load) : null,
    avgPrice: price ? mean(price) : null,
    priceRange: price ? [Math.min(...price), Math.max(...price)] : null,
  };
}

// ---- actions -----------------------------------------------------------------
const editorOpen = ref(false);
const editorInitial = ref<ScenarioSet | null>(null);
function openNew() {
  editorInitial.value = null;
  editorOpen.value = true;
}
function openEdit() {
  editorInitial.value = selected.value;
  editorOpen.value = true;
}
async function onSaved(created: ScenarioSet) {
  await load();
  selectedName.value = created.name;
  selectedVersionId.value = created.id;
  router.replace({ query: { ...route.query, set: created.name } });
}

function errText(e: any, fallback: string) {
  const d = e?.data?.detail;
  return typeof d === "string" ? d : Array.isArray(d) ? d.map((x: any) => x.msg).join("; ") : fallback;
}

const duplicating = ref(false);
async function duplicate() {
  const s = selected.value;
  if (!s) return;
  duplicating.value = true;
  try {
    let name = `${s.name} copy`;
    for (let n = 2; families.value.some((f) => f.name === name); n++) name = `${s.name} copy ${n}`;
    const created = await createScenarioSet(projectId.value, {
      name,
      mode: s.mode,
      number_of_steps: s.number_of_steps,
      timestep_hours: s.timestep_hours,
      scenarios: JSON.parse(JSON.stringify(s.scenarios)),
    });
    toast.add({ title: `Duplicated as “${name}”`, description: "Edit the copy freely; the original and its runs are unchanged.", color: "success", icon: "i-lucide-copy" });
    await onSaved(created);
  } catch (e: any) {
    toast.add({ title: "Could not duplicate", description: errText(e, "The backend rejected the request."), color: "error" });
  } finally {
    duplicating.value = false;
  }
}

const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
async function onFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  uploading.value = true;
  try {
    const created = await uploadScenarioCsv(projectId.value, file);
    toast.add({ title: "Forecast uploaded", description: `${created.name} · ${created.number_of_steps} steps`, color: "success" });
    await onSaved(created);
  } catch (e: any) {
    toast.add({ title: "Could not read that CSV", description: errText(e, "Columns must be step, load:<name>, price:<name> or cap:<name>."), color: "error" });
  } finally {
    uploading.value = false;
  }
}

function exportCsv(sc: ScenarioDef) {
  const s = selected.value!;
  const cols: [string, number[]][] = [
    ...Object.entries(sc.load_profiles).map(([k, v]) => [`load:${k}`, v] as [string, number[]]),
    ...Object.entries(sc.available_capacity_profiles).map(([k, v]) => [`cap:${k}`, v] as [string, number[]]),
    ...Object.entries(sc.market_prices).map(([k, v]) => [`price:${k}`, v] as [string, number[]]),
  ];
  const lines = ["step," + cols.map(([h]) => h).join(",")];
  for (let i = 0; i < s.number_of_steps; i++) lines.push([i, ...cols.map(([, v]) => v[i] ?? "")].join(","));
  downloadText(`${s.name}-v${s.version}-${sc.name}.csv`.replace(/\s+/g, "_"), lines.join("\n") + "\n");
}
const exportItems = computed<DropdownMenuItem[]>(() =>
  (selected.value?.scenarios ?? []).map((sc) => ({ label: sc.name, icon: "i-lucide-file-down", onSelect: () => exportCsv(sc) })),
);

const horizon = computed(() => (selected.value ? +(selected.value.number_of_steps * selected.value.timestep_hours).toFixed(2) : 0));
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <PageHeader :crumbs="[{ label: currentProject?.name ?? 'Project', to: `/p/${projectId}/runs` }, { label: 'Scenarios' }]">
        <template #actions>
          <input ref="fileInput" type="file" accept=".csv,text/csv" class="sr-only" tabindex="-1" aria-hidden="true" @change="onFile" />
          <UButton label="Upload CSV" icon="i-lucide-upload" color="neutral" variant="outline" :loading="uploading" @click="fileInput?.click()" />
          <UButton label="New scenario set" icon="i-lucide-plus" @click="openNew" />
        </template>
      </PageHeader>
    </template>

    <template #body>
      <ErrorState v-if="loadError" :message="loadError" @retry="load" />
      <div v-else-if="families.length === 0" class="mx-auto w-full max-w-xl pt-8">
        <EmptyState
          icon="i-lucide-chart-spline"
          title="No scenarios yet"
          description="A scenario set holds the forecasts the optimizer plans against: demand, market prices and generator availability. Create one by hand or upload a CSV from a spreadsheet."
        >
          <UButton label="New scenario set" icon="i-lucide-plus" @click="openNew" />
          <UButton label="Upload CSV" icon="i-lucide-upload" color="neutral" variant="outline" @click="fileInput?.click()" />
        </EmptyState>
      </div>

      <div v-else class="flex max-w-[1280px] flex-wrap items-start gap-5">
        <!-- list -->
        <aside class="flex w-full shrink-0 flex-col gap-2 lg:w-72" aria-label="Scenario sets">
          <button
            v-for="f in families"
            :key="f.name"
            type="button"
            class="flex flex-col gap-1 rounded-lg border bg-default px-3.5 py-3 text-left transition-colors hover:bg-elevated/60"
            :class="f.name === family?.name ? 'border-primary ring-1 ring-primary' : 'border-default'"
            :aria-current="f.name === family?.name ? 'true' : undefined"
            @click="pick(f)"
          >
            <span class="flex items-center gap-2">
              <span class="min-w-0 flex-1 truncate text-sm font-semibold text-highlighted">{{ f.name }}</span>
              <UBadge color="neutral" variant="outline" size="sm" :label="`v${f.latest.version}`" />
            </span>
            <span class="text-xs text-muted">
              {{ f.latest.mode === "stochastic" ? `${f.latest.scenarios.length} scenarios` : "Single forecast" }} · {{ f.latest.number_of_steps }} × {{ f.latest.timestep_hours }} h
            </span>
            <span class="text-xs text-dimmed">Saved {{ fmtDate(f.latest.created_at) }} · {{ runCount(f.latest.id) }} {{ runCount(f.latest.id) === 1 ? "run" : "runs" }} on latest</span>
          </button>
        </aside>

        <!-- detail -->
        <div v-if="selected" class="flex min-w-0 flex-1 basis-[560px] flex-col gap-4">
          <Panel>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div class="flex min-w-0 flex-col">
                <h1 class="truncate text-lg font-semibold text-highlighted">{{ selected.name }}</h1>
                <p class="text-xs text-muted">
                  {{ selected.mode === "stochastic" ? "Several weighted scenarios, optimized together" : "One forecast, solved on its own" }} · {{ selected.number_of_steps }} steps of {{ selected.timestep_hours }} h = {{ horizon }} h
                </p>
              </div>
              <USelectMenu
                :model-value="selected.id"
                :items="[...(family?.versions ?? [])].reverse().map((v) => ({ label: `v${v.version}${v.id === family?.latest.id ? ' (latest)' : ''} · ${fmtDate(v.created_at)}`, value: v.id }))"
                value-key="value"
                :search-input="false"
                class="w-56"
                aria-label="Version"
                @update:model-value="(v: number) => (selectedVersionId = v)"
              />
              <div class="ml-auto flex flex-wrap items-center gap-2">
                <UDropdownMenu v-if="exportItems.length > 1" :items="exportItems" :content="{ align: 'end' }">
                  <UButton label="Export CSV" icon="i-lucide-download" color="neutral" variant="ghost" trailing-icon="i-lucide-chevron-down" />
                </UDropdownMenu>
                <UButton v-else label="Export CSV" icon="i-lucide-download" color="neutral" variant="ghost" @click="exportCsv(selected.scenarios[0]!)" />
                <UButton label="Duplicate" icon="i-lucide-copy" color="neutral" variant="outline" :loading="duplicating" @click="duplicate" />
                <UButton :label="isLatest ? 'Edit' : 'Edit as new version'" icon="i-lucide-pencil" @click="openEdit" />
              </div>
            </div>
            <UAlert
              v-if="!isLatest"
              class="mt-3"
              color="neutral"
              variant="subtle"
              icon="i-lucide-history"
              :title="`You are looking at v${selected.version}, an older version.`"
              description="Editing it saves a new latest version; nothing already saved is changed."
            />
          </Panel>

          <Panel v-if="selected.mode === 'stochastic'" title="Scenarios" description="How the alternative futures differ. The optimizer weighs each by its probability.">
            <div class="overflow-x-auto">
              <table class="w-full min-w-[560px] text-sm">
                <thead class="bg-ink-950/[0.05] dark:bg-black/25 text-left text-xs font-semibold text-toned">
                  <tr>
                    <th class="px-4 py-2">Scenario</th>
                    <th class="px-3 py-2 text-right">Probability</th>
                    <th class="px-3 py-2 text-right">Avg demand</th>
                    <th class="px-3 py-2 text-right">Peak demand</th>
                    <th class="px-3 py-2 text-right">Avg price</th>
                    <th class="px-3 py-2 text-right">Price range</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(sc, i) in selected.scenarios" :key="sc.name" class="border-t border-muted">
                    <td class="px-4 py-2">
                      <span class="flex items-center gap-2 text-highlighted"><span class="size-2.5 rounded-sm" :style="{ background: SCENARIO_COLORS[i % SCENARIO_COLORS.length] }" />{{ sc.name }}</span>
                    </td>
                    <td class="px-3 py-2 text-right font-mono">{{ fmtPct(sc.probability) }}</td>
                    <td class="px-3 py-2 text-right font-mono">{{ scenarioStats(sc).avgLoad === null ? "—" : fmtMW(scenarioStats(sc).avgLoad!, 1) }}</td>
                    <td class="px-3 py-2 text-right font-mono">{{ scenarioStats(sc).peakLoad === null ? "—" : fmtMW(scenarioStats(sc).peakLoad!, 1) }}</td>
                    <td class="px-3 py-2 text-right font-mono">{{ scenarioStats(sc).avgPrice === null ? "—" : fmtPrice(scenarioStats(sc).avgPrice!) }}</td>
                    <td class="px-3 py-2 text-right font-mono">{{ scenarioStats(sc).priceRange ? `${fmtNum(scenarioStats(sc).priceRange![0], 0)} to ${fmtNum(scenarioStats(sc).priceRange![1], 0)}` : "—" }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>

          <section v-for="sec in sections" :key="sec.key" class="flex flex-col gap-2">
            <h2 class="flex items-center gap-2 text-sm font-semibold text-highlighted">
              <UIcon :name="sec.icon" class="size-4 text-muted" />{{ sec.title }}<span class="font-mono text-xs font-normal text-dimmed">{{ sec.unit }}</span>
            </h2>
            <div class="grid gap-4" :class="sec.charts.length > 1 ? 'md:grid-cols-2' : ''">
              <Panel v-for="ch in sec.charts" :key="ch.asset" :title="ch.asset">
                <ScenarioProfileChart :series="ch.series" :unit="sec.unit" :step-hours="selected.timestep_hours" area />
              </Panel>
            </div>
          </section>

          <Panel title="Used by" :description="usedBy.length ? `${usedBy.length} ${usedBy.length === 1 ? 'run' : 'runs'} solved with v${selected.version}` : undefined">
            <div v-if="usedBy.length" class="flex flex-wrap gap-2">
              <UButton v-for="r in usedBy" :key="r.id" :label="r.display_id" :to="`/p/${projectId}/runs/${r.id}`" size="xs" color="neutral" variant="outline" class="font-mono" />
            </div>
            <div v-else class="flex flex-wrap items-center gap-3 text-sm text-muted">
              <span>No run has used this version yet.</span>
              <UButton label="Start a run" icon="i-lucide-play" size="xs" :to="`/p/${projectId}/runs/new`" />
            </div>
          </Panel>
        </div>
      </div>

      <ScenarioSetSlideover v-model:open="editorOpen" :project-id="projectId" :portfolio="portfolio" default-mode="deterministic" :initial="editorInitial" @created="onSaved" />
    </template>
  </UDashboardPanel>
</template>
