<script setup lang="ts">
import type { GeneratorAsset, ScenarioResults } from "~/types";

const props = defineProps<{
  scenario: ScenarioResults;
  generators: GeneratorAsset[];
  assetColors: Record<string, string>;
  stepHours?: number;
}>();

const hrs = computed(() => props.stepHours ?? 1);
const ucGenerators = computed(() => props.generators.filter((g) => g.unit_commitment && props.scenario.generators[g.name]));
const nSteps = computed(() => props.scenario.generators[ucGenerators.value[0]?.name ?? ""]?.power.length ?? 0);
// Label roughly every 6 hours of the horizon.
const tickEvery = computed(() => Math.max(1, Math.round(6 / hrs.value)));

function cellStyle(gen: GeneratorAsset, t: number) {
  const d = props.scenario.generators[gen.name];
  const on = (d.status[t] ?? 0) > 0.5;
  if (!on) return { background: "var(--ui-bg-elevated)" };
  const alpha = 0.35 + 0.65 * Math.min(1, (d.power[t] ?? 0) / gen.nominal_power);
  const color = props.assetColors[gen.name] ?? ASSET_DEFAULT_COLOR.generator;
  return { background: `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)` };
}

const isStartup = (gen: GeneratorAsset, t: number) => (props.scenario.generators[gen.name]?.startup[t] ?? 0) > 0.5;

function cellTitle(gen: GeneratorAsset, t: number) {
  const d = props.scenario.generators[gen.name];
  const on = (d.status[t] ?? 0) > 0.5;
  return `${stepTimeLabel(t, hrs.value)} · ${on ? "on" : "off"} · ${fmtMW(d.power[t] ?? 0)}${isStartup(gen, t) ? " · startup" : ""}`;
}

function stat(gen: GeneratorAsset) {
  const d = props.scenario.generators[gen.name];
  const startups = d.startup.filter((v) => v > 0.5).length;
  return { hoursOn: d.status.filter((v) => v > 0.5).length * hrs.value, startups, cost: startups * gen.startup_cost };
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <Panel v-for="gen in ucGenerators" :key="gen.name" :title="gen.name" :description="`min up ${gen.min_up_time} · min down ${gen.min_down_time} steps · min power ${fmtMW(gen.min_power)}`">
      <template #actions>
        <dl class="flex flex-wrap gap-x-5 text-xs text-muted">
          <div><dt class="inline">On </dt><dd class="inline font-mono text-default">{{ stat(gen).hoursOn.toFixed(1) }} h</dd></div>
          <div><dt class="inline">Startups </dt><dd class="inline font-mono text-default">{{ stat(gen).startups }}</dd></div>
          <div><dt class="inline">Startup cost </dt><dd class="inline font-mono text-default">{{ fmtMoneyFull(stat(gen).cost) }}</dd></div>
        </dl>
      </template>
      <div class="flex gap-px rounded-md bg-muted p-px" role="img" :aria-label="`${gen.name} on/off timeline`">
        <div
          v-for="t in nSteps"
          :key="t"
          class="relative h-9 min-w-3 flex-1"
          :style="cellStyle(gen, t - 1)"
          :title="cellTitle(gen, t - 1)"
        >
          <div v-if="isStartup(gen, t - 1)" class="absolute inset-y-0 left-0 w-[3px] bg-inverted" />
        </div>
      </div>
      <div class="mt-1 flex gap-px font-mono text-xs text-muted">
        <span v-for="t in nSteps" :key="t" class="min-w-3 flex-1 overflow-visible whitespace-nowrap">{{ (t - 1) % tickEvery === 0 ? stepTimeLabel(t - 1, hrs) : "" }}</span>
      </div>
    </Panel>
    <div v-if="ucGenerators.length" class="flex flex-wrap items-center gap-4 text-xs text-muted">
      <span class="flex items-center gap-1.5"><span class="size-3 rounded-sm bg-elevated" />Off</span>
      <span class="flex items-center gap-1.5"><span class="size-3 rounded-sm bg-neutral-400" />On (opacity = output / nominal power)</span>
      <span class="flex items-center gap-1.5"><span class="h-3 w-[3px] bg-inverted" />Startup</span>
    </div>
    <EmptyState
      v-if="ucGenerators.length === 0"
      icon="i-lucide-table-2"
      title="No unit-commitment generators"
      description="Enable unit commitment on a generator in the portfolio to see its on/off timeline."
    />
    <p v-else-if="ucGenerators.length < generators.length" class="text-xs text-dimmed">
      Generators without unit-commitment parameters ({{ generators.filter((g) => !g.unit_commitment).map((g) => g.name).join(", ") }}) are not shown.
    </p>
  </div>
</template>
