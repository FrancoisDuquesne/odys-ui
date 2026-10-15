<script setup lang="ts">
import type { PortfolioVersion, ScenarioDef, ScenarioSet } from "~/types";

type Group = "load" | "cap" | "price";
type Fill = "const" | "values" | "off";
interface ProfileRow {
  group: Group;
  asset: string;
  fill: Fill;
  value: number;
  text: string;
}
interface ScenarioRow {
  name: string;
  percent: number;
  loadScale: number;
  capScale: number;
  priceScale: number;
}

const props = defineProps<{
  open: boolean;
  projectId: number;
  portfolio: PortfolioVersion | null;
  defaultMode: ScenarioSet["mode"];
  /** When set, the panel edits this set and saves the result as its next version. */
  initial?: ScenarioSet | null;
}>();
const emit = defineEmits<{ "update:open": [boolean]; created: [ScenarioSet] }>();

const { createScenarioSet, uploadScenarioCsv } = useScenarioSets();
const toast = useToast();

const name = ref("Forecast set");
const mode = ref<ScenarioSet["mode"]>(props.defaultMode);
const steps = ref(24);
const stepHours = ref(1);
const rows = ref<ProfileRow[]>([]);
const scenarios = ref<ScenarioRow[]>([]);
// Editing an existing set: each scenario carries its own full profiles instead of scaling a shared base.
interface EditScenario {
  name: string;
  percent: number;
  rows: ProfileRow[];
}
const editScenarios = ref<EditScenario[]>([]);
const activeIdx = ref(0);
const editing = computed(() => !!props.initial);
// Versions are numbered per name, so a changed name starts a new set instead of adding a version.
const renamed = computed(() => editing.value && name.value.trim() !== props.initial!.name);
const saving = ref(false);
const error = ref<string | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const GROUP_META: Record<Group, { title: string; unit: string; hint: string; icon: string }> = {
  load: { title: "Demand", unit: "MW", hint: "Power each load needs per step", icon: "i-lucide-plug" },
  price: { title: "Market prices", unit: "$/MWh", hint: "Price each market pays or charges per step", icon: "i-lucide-trending-up" },
  cap: { title: "Generator availability", unit: "MW", hint: "Only for generators whose output varies (wind, solar). Off means always fully available.", icon: "i-lucide-zap" },
};

function buildRows(): ProfileRow[] {
  const assets = props.portfolio?.assets ?? [];
  const out: ProfileRow[] = [];
  for (const a of assets) if (a.kind === "load") out.push({ group: "load", asset: a.name, fill: "const", value: 100, text: "" });
  for (const a of assets) if (a.kind === "market") out.push({ group: "price", asset: a.name, fill: "const", value: 50, text: "" });
  for (const a of assets) if (a.kind === "generator") out.push({ group: "cap", asset: a.name, fill: "off", value: a.nominal_power, text: "" });
  return out;
}

function numbersToRow(group: Group, asset: string, fallback: ProfileRow, values: number[] | undefined): ProfileRow {
  if (!values) return { ...fallback, group, asset };
  const allSame = values.length > 0 && values.every((v) => v === values[0]);
  return allSame
    ? { group, asset, fill: "const", value: values[0]!, text: "" }
    : { group, asset, fill: "values", value: values[0] ?? 0, text: values.join(", ") };
}

function rowsFromScenario(sc: ScenarioDef): ProfileRow[] {
  return buildRows().map((r) => {
    const source = r.group === "load" ? sc.load_profiles : r.group === "price" ? sc.market_prices : sc.available_capacity_profiles;
    return numbersToRow(r.group, r.asset, r, source[r.asset]);
  });
}

function defaultScenarios(m: ScenarioSet["mode"]): ScenarioRow[] {
  return m === "stochastic"
    ? [
        { name: "Base", percent: 50, loadScale: 100, capScale: 100, priceScale: 100 },
        { name: "High demand", percent: 30, loadScale: 120, capScale: 100, priceScale: 115 },
        { name: "Low availability", percent: 20, loadScale: 100, capScale: 70, priceScale: 100 },
      ]
    : [{ name: "Base", percent: 100, loadScale: 100, capScale: 100, priceScale: 100 }];
}

// Reset whenever the panel is opened so it always starts from the current portfolio.
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    error.value = null;
    activeIdx.value = 0;
    const init = props.initial;
    if (init) {
      mode.value = init.mode;
      name.value = init.name;
      steps.value = init.number_of_steps;
      stepHours.value = init.timestep_hours;
      editScenarios.value = init.scenarios.map((sc) => ({ name: sc.name, percent: +(sc.probability * 100).toFixed(2), rows: rowsFromScenario(sc) }));
      return;
    }
    mode.value = props.defaultMode;
    name.value = "Forecast set";
    steps.value = 24;
    stepHours.value = 1;
    rows.value = buildRows();
    scenarios.value = defaultScenarios(mode.value);
  },
  { immediate: true },
);
watch(mode, (m) => {
  if (!editing.value) scenarios.value = defaultScenarios(m);
});

const visibleRows = computed(() => (editing.value ? (editScenarios.value[activeIdx.value]?.rows ?? []) : rows.value));
const groups = computed(() =>
  (["load", "price", "cap"] as Group[])
    .map((g) => ({ group: g, ...GROUP_META[g], items: visibleRows.value.filter((r) => r.group === g) }))
    .filter((g) => g.items.length > 0),
);

function parseValues(text: string): number[] {
  return text
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(Number);
}
function rowValues(r: ProfileRow): number[] | null {
  if (r.fill === "off") return null;
  return r.fill === "const" ? Array.from({ length: steps.value }, () => r.value) : parseValues(r.text);
}
function rowIssue(r: ProfileRow): string | null {
  if (r.fill === "off") return null;
  if (r.fill === "const") return Number.isFinite(r.value) ? null : "Enter a number";
  const v = parseValues(r.text);
  if (v.some((n) => !Number.isFinite(n))) return "Only numbers, separated by commas or spaces";
  if (v.length !== steps.value) return `${v.length} values entered, ${steps.value} needed`;
  return null;
}

const probabilityList = computed(() => (editing.value ? editScenarios.value : scenarios.value));
const probabilityTotal = computed(() => probabilityList.value.reduce((s, r) => s + (Number(r.percent) || 0), 0));
const allRows = computed(() => (editing.value ? editScenarios.value.flatMap((sc) => sc.rows.map((r) => ({ r, where: editScenarios.value.length > 1 ? `${sc.name} · ` : "" }))) : rows.value.map((r) => ({ r, where: "" }))));

const problems = computed(() => {
  const p: string[] = [];
  if (!name.value.trim()) p.push("Give the set a name.");
  if (!Number.isInteger(steps.value) || steps.value < 1) p.push("Steps must be a whole number of at least 1.");
  if (!(stepHours.value > 0)) p.push("Step length must be above 0 hours.");
  if (!props.portfolio) p.push("Create a portfolio first.");
  if (!allRows.value.some(({ r }) => r.group === "price" && r.fill !== "off")) p.push("Add at least one market price.");
  for (const { r, where } of allRows.value) {
    const issue = rowIssue(r);
    if (issue) p.push(`${where}${r.asset}: ${issue}.`);
  }
  if (mode.value === "stochastic") {
    if (probabilityList.value.length < 2) p.push("Add at least two scenarios, or switch to a single forecast.");
    if (Math.abs(probabilityTotal.value - 100) > 0.01) p.push(`Probabilities add up to ${+probabilityTotal.value.toFixed(1)}%, they must total 100%.`);
    const names = probabilityList.value.map((s) => s.name.trim());
    if (names.some((n) => !n)) p.push("Every scenario needs a name.");
    if (new Set(names).size !== names.length) p.push("Scenario names must be unique.");
  }
  return p;
});

function buildEdited(s: EditScenario): ScenarioDef {
  const def: ScenarioDef = {
    name: s.name.trim() || "Base",
    probability: mode.value === "stochastic" ? s.percent / 100 : 1,
    load_profiles: {},
    available_capacity_profiles: {},
    market_prices: {},
  };
  for (const r of s.rows) {
    const v = rowValues(r);
    if (!v) continue;
    if (r.group === "load") def.load_profiles[r.asset] = v;
    else if (r.group === "cap") def.available_capacity_profiles[r.asset] = v;
    else def.market_prices[r.asset] = v;
  }
  return def;
}

function buildScenario(s: ScenarioRow): ScenarioDef {
  const def: ScenarioDef = {
    name: s.name.trim() || "Base",
    probability: mode.value === "stochastic" ? s.percent / 100 : 1,
    load_profiles: {},
    available_capacity_profiles: {},
    market_prices: {},
  };
  const scale: Record<Group, number> = { load: s.loadScale / 100, cap: s.capScale / 100, price: s.priceScale / 100 };
  for (const r of rows.value) {
    const v = rowValues(r);
    if (!v) continue;
    const scaled = v.map((n) => +(n * scale[r.group]).toFixed(6));
    if (r.group === "load") def.load_profiles[r.asset] = scaled;
    else if (r.group === "cap") def.available_capacity_profiles[r.asset] = scaled;
    else def.market_prices[r.asset] = scaled;
  }
  return def;
}

function failure(e: any, fallback: string) {
  const d = e?.data?.detail;
  return typeof d === "string" ? d : Array.isArray(d) ? d.map((x: any) => x.msg).join("; ") : fallback;
}

async function save() {
  if (problems.value.length) return;
  saving.value = true;
  error.value = null;
  try {
    const rowsForMode = mode.value === "stochastic" ? scenarios.value : scenarios.value.slice(0, 1);
    const created = await createScenarioSet(props.projectId, {
      name: name.value.trim(),
      mode: mode.value,
      number_of_steps: steps.value,
      timestep_hours: stepHours.value,
      scenarios: editing.value ? editScenarios.value.map(buildEdited) : rowsForMode.map(buildScenario),
    });
    toast.add({ title: editing.value && !renamed.value ? `Saved as v${created.version}` : "Scenario set created", description: editing.value && !renamed.value ? "New runs can use this version; existing runs are unchanged." : `${created.name} · v${created.version}`, color: "success" });
    emit("created", created);
    emit("update:open", false);
  } catch (e: any) {
    error.value = failure(e, "Could not save the scenario set.");
  } finally {
    saving.value = false;
  }
}

async function onFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  saving.value = true;
  error.value = null;
  try {
    const created = await uploadScenarioCsv(props.projectId, file);
    toast.add({ title: "Forecast uploaded", description: `${created.name} · ${created.number_of_steps} steps`, color: "success" });
    emit("created", created);
    emit("update:open", false);
  } catch (e: any) {
    error.value = failure(e, "Could not read that CSV. Check the column names against the template.");
  } finally {
    saving.value = false;
  }
}

// A starter file whose headers match this portfolio, filled with the current constants.
function downloadTemplate() {
  const cols = visibleRows.value.map((r) => ({ head: `${r.group}:${r.asset}`, value: r.value }));
  const lines = ["step," + cols.map((c) => c.head).join(",")];
  for (let i = 0; i < steps.value; i++) lines.push([i, ...cols.map((c) => c.value)].join(","));
  downloadText("forecast-template.csv", lines.join("\n") + "\n");
}

function addEditScenario() {
  const src = editScenarios.value[activeIdx.value];
  if (!src) return;
  editScenarios.value.push({ name: `${src.name} copy`, percent: 0, rows: src.rows.map((r) => ({ ...r })) });
  activeIdx.value = editScenarios.value.length - 1;
}
function removeEditScenario(i: number) {
  editScenarios.value.splice(i, 1);
  activeIdx.value = Math.min(activeIdx.value, editScenarios.value.length - 1);
}

function addScenario() {
  scenarios.value.push({ name: `Scenario ${scenarios.value.length + 1}`, percent: 0, loadScale: 100, capScale: 100, priceScale: 100 });
}
function evenSplit() {
  const list = probabilityList.value;
  const n = list.length;
  list.forEach((s) => (s.percent = +(100 / n).toFixed(2)));
  const drift = 100 - list.reduce((t, s) => t + s.percent, 0);
  if (n) list[n - 1]!.percent = +(list[n - 1]!.percent + drift).toFixed(2);
}
</script>

<template>
  <USlideover :open="open" side="right" :ui="{ content: 'max-w-[680px]' }" @update:open="(v) => $emit('update:open', v)">
    <template #content>
      <div class="flex h-full flex-col">
        <div class="flex h-16 shrink-0 items-center gap-3 border-b border-default px-5">
          <span class="text-base font-semibold text-highlighted">{{ editing ? `Edit ${initial!.name}` : "New scenario set" }}</span>
          <span class="text-xs text-muted">{{ editing ? `v${initial!.version} stays as it is` : "Forecasts the optimizer plans against" }}</span>
          <UButton icon="i-lucide-x" color="neutral" variant="ghost" class="ml-auto" aria-label="Close" @click="$emit('update:open', false)" />
        </div>

        <div class="flex-1 overflow-auto p-5">
          <div class="flex flex-col gap-6">
            <section class="flex flex-col gap-4">
              <div class="grid grid-cols-[1fr_auto] items-end gap-3">
                <UFormField
                  label="Name"
                  required
                  :help="renamed ? `Saved as v1 of a new set. “${initial!.name}” stays as it is.` : editing ? 'Keep the name to add a new version. Change it to save a separate set.' : undefined"
                >
                  <UInput v-model="name" class="w-full" placeholder="e.g. Winter week forecast" />
                </UFormField>
                <UBadge v-if="editing" color="neutral" variant="subtle" :label="mode === 'stochastic' ? 'Several scenarios' : 'Single forecast'" class="mb-2" />
                <SegmentedControl
                  v-else
                  v-model="mode"
                  label="Scenario type"
                  size="md"
                  :items="[
                    { value: 'deterministic', label: 'Single forecast', hint: 'One expected future' },
                    { value: 'stochastic', label: 'Several scenarios', hint: 'Weighted alternative futures, optimized together' },
                  ]"
                />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <UFormField label="Steps" description="How many time steps to plan">
                  <UInputNumber v-model="steps" :min="1" :step="1" class="w-full" :disabled="editing" />
                </UFormField>
                <UFormField label="Step length (hours)" description="1 = hourly, 0.25 = 15 minutes">
                  <UInputNumber v-model="stepHours" :min="0.05" :step="0.25" class="w-full" :disabled="editing" />
                </UFormField>
              </div>
              <p class="text-xs text-toned">
                Horizon: {{ +(steps * stepHours).toFixed(2) }} h<span v-if="editing"> · the horizon is fixed when editing; create a new set to change it.</span>
              </p>
            </section>

            <UAlert
              v-if="!portfolio"
              color="warning"
              variant="subtle"
              icon="i-lucide-triangle-alert"
              title="No portfolio in this project yet"
              description="A scenario set needs the loads and markets of a portfolio. Create one first."
            />

            <section v-if="editing && mode === 'stochastic'" class="flex flex-col gap-3">
              <div class="flex flex-wrap items-center gap-2">
                <UIcon name="i-lucide-git-fork" class="size-4 text-muted" />
                <h3 class="text-sm font-semibold text-highlighted">Scenarios</h3>
                <UButton label="Split evenly" size="xs" color="neutral" variant="ghost" class="ml-auto" @click="evenSplit" />
                <UButton label="Duplicate this scenario" icon="i-lucide-copy" size="xs" color="neutral" variant="soft" @click="addEditScenario" />
              </div>
              <div class="flex flex-col divide-y divide-muted rounded-md border border-muted">
                <label v-for="(sc, i) in editScenarios" :key="i" class="flex cursor-pointer items-center gap-3 px-3 py-2" :class="i === activeIdx ? 'bg-elevated/60' : ''">
                  <input v-model="activeIdx" type="radio" :value="i" class="accent-primary" :aria-label="`Edit ${sc.name}`" />
                  <UInput v-model="sc.name" size="sm" class="min-w-0 flex-1" :aria-label="`Scenario ${i + 1} name`" @focus="activeIdx = i" />
                  <UInputNumber v-model="sc.percent" size="sm" :min="0" :max="100" :step="5" class="w-28" :aria-label="`${sc.name} probability %`" @focus="activeIdx = i" />
                  <span class="text-xs text-muted">%</span>
                  <UButton v-if="editScenarios.length > 2" icon="i-lucide-trash-2" size="xs" color="neutral" variant="ghost" :aria-label="`Remove ${sc.name}`" @click.prevent="removeEditScenario(i)" />
                </label>
                <div class="flex items-center gap-3 bg-muted px-3 py-2 text-xs">
                  <span class="flex-1 text-toned">Total probability</span>
                  <span class="font-mono font-semibold" :class="Math.abs(probabilityTotal - 100) < 0.01 ? 'text-success' : 'text-error'">{{ +probabilityTotal.toFixed(1) }}%</span>
                </div>
              </div>
              <p class="text-xs text-toned">The profiles below belong to <strong class="text-highlighted">{{ editScenarios[activeIdx]?.name }}</strong>. Pick another scenario above to edit its profiles.</p>
            </section>

            <section v-for="g in groups" :key="g.group" class="flex flex-col gap-2">
              <div class="flex items-center gap-2">
                <UIcon :name="g.icon" class="size-4 text-muted" />
                <h3 class="text-sm font-semibold text-highlighted">{{ g.title }}</h3>
                <span class="font-mono text-xs text-dimmed">{{ g.unit }}</span>
              </div>
              <p class="text-xs text-toned">{{ g.hint }}</p>
              <div class="flex flex-col divide-y divide-muted rounded-md border border-muted">
                <div v-for="r in g.items" :key="r.group + r.asset" class="flex flex-col gap-2 p-3">
                  <div class="flex flex-wrap items-center gap-3">
                    <span class="min-w-28 flex-1 truncate text-sm font-medium text-highlighted">{{ r.asset }}</span>
                    <SegmentedControl
                      v-model="r.fill"
                      :label="`${r.asset} profile`"
                      :items="[
                        ...(r.group === 'cap' ? [{ value: 'off', label: 'Off' }] : []),
                        { value: 'const', label: 'Constant' },
                        { value: 'values', label: 'Per step' },
                      ]"
                    />
                    <UInputNumber v-if="r.fill === 'const'" v-model="r.value" :step="r.group === 'price' ? 1 : 10" class="w-32" :aria-label="`${r.asset} value`" />
                  </div>
                  <UTextarea
                    v-if="r.fill === 'values'"
                    v-model="r.text"
                    :rows="2"
                    class="w-full font-mono"
                    :placeholder="`${steps} numbers, e.g. 80, 75, 70, ...`"
                    :aria-label="`${r.asset} values per step`"
                  />
                  <p v-if="rowIssue(r)" class="text-xs text-error">{{ rowIssue(r) }}</p>
                </div>
              </div>
            </section>

            <section v-if="mode === 'stochastic' && !editing" class="flex flex-col gap-2">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-git-fork" class="size-4 text-muted" />
                <h3 class="text-sm font-semibold text-highlighted">Scenarios</h3>
                <UButton label="Split evenly" size="xs" color="neutral" variant="ghost" class="ml-auto" @click="evenSplit" />
              </div>
              <p class="text-xs text-toned">Each scenario scales the profiles above. 100% keeps them as entered, 120% raises them by a fifth.</p>
              <div class="overflow-x-auto rounded-md border border-muted">
                <table class="w-full min-w-[520px] text-sm">
                  <thead class="bg-ink-950/[0.05] dark:bg-black/25 text-left text-xs font-semibold text-toned">
                    <tr>
                      <th class="px-3 py-2">Name</th>
                      <th class="px-2 py-2">Probability %</th>
                      <th class="px-2 py-2">Demand %</th>
                      <th class="px-2 py-2">Availability %</th>
                      <th class="px-2 py-2">Prices %</th>
                      <th class="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(s, i) in scenarios" :key="i" class="border-t border-muted">
                      <td class="px-3 py-1.5"><UInput v-model="s.name" size="sm" class="w-full" :aria-label="`Scenario ${i + 1} name`" /></td>
                      <td class="px-2 py-1.5"><UInputNumber v-model="s.percent" size="sm" :min="0" :max="100" :step="5" class="w-24" :aria-label="`${s.name} probability`" /></td>
                      <td class="px-2 py-1.5"><UInputNumber v-model="s.loadScale" size="sm" :min="0" :step="5" class="w-24" :aria-label="`${s.name} demand scale`" /></td>
                      <td class="px-2 py-1.5"><UInputNumber v-model="s.capScale" size="sm" :min="0" :step="5" class="w-24" :aria-label="`${s.name} availability scale`" /></td>
                      <td class="px-2 py-1.5"><UInputNumber v-model="s.priceScale" size="sm" :min="0" :step="5" class="w-24" :aria-label="`${s.name} price scale`" /></td>
                      <td class="pr-2"><UButton v-if="scenarios.length > 2" icon="i-lucide-trash-2" size="xs" color="neutral" variant="ghost" :aria-label="`Remove ${s.name}`" @click="scenarios.splice(i, 1)" /></td>
                    </tr>
                    <tr class="border-t border-muted bg-muted text-xs">
                      <td class="px-3 py-2 text-toned">Total</td>
                      <td class="px-2 py-2 font-mono font-semibold" :class="Math.abs(probabilityTotal - 100) < 0.01 ? 'text-success' : 'text-error'">{{ +probabilityTotal.toFixed(1) }}%</td>
                      <td colspan="4" />
                    </tr>
                  </tbody>
                </table>
              </div>
              <UButton label="Add scenario" icon="i-lucide-plus" size="xs" color="neutral" variant="soft" class="self-start" @click="addScenario" />
            </section>

            <section v-if="mode === 'deterministic' && !editing" class="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-default p-3">
              <UIcon name="i-lucide-file-spreadsheet" class="size-5 text-muted" />
              <p class="min-w-48 flex-1 text-xs text-toned">
                Already have a forecast in a spreadsheet? Upload a CSV with a <code class="font-mono">step</code> column and one column per profile, such as <code class="font-mono">load:Site demand</code>, <code class="font-mono">price:Day Ahead</code> or <code class="font-mono">cap:Wind 1</code>.
              </p>
              <UButton label="Template" icon="i-lucide-download" size="xs" color="neutral" variant="ghost" :disabled="rows.length === 0" @click="downloadTemplate" />
              <UButton label="Upload CSV" icon="i-lucide-upload" size="xs" color="neutral" variant="soft" :loading="saving" @click="fileInput?.click()" />
              <input ref="fileInput" type="file" accept=".csv,text/csv" class="sr-only" tabindex="-1" aria-hidden="true" @change="onFile" />
            </section>

            <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" title="Not saved" :description="error" />
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-3 border-t border-default px-5 py-3">
          <ul v-if="problems.length" class="min-w-0 flex-1 text-xs text-toned">
            <li class="truncate" :title="problems.join(' ')">{{ problems[0] }}<span v-if="problems.length > 1"> (+{{ problems.length - 1 }} more)</span></li>
          </ul>
          <span v-else class="flex-1 text-xs text-success">Ready to save</span>
          <UButton label="Cancel" color="neutral" variant="ghost" @click="$emit('update:open', false)" />
          <UButton :label="editing ? (renamed ? 'Save as new set' : 'Save as new version') : 'Create scenario set'" :loading="saving" :disabled="problems.length > 0" @click="save" />
        </div>
      </div>
    </template>
  </USlideover>
</template>
