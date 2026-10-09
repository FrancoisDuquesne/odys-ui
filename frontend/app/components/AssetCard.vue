<script setup lang="ts">
import type { Asset } from "~/types";

const props = defineProps<{ asset: Asset; maxGeneratorPower: number }>();
defineEmits<{ click: [] }>();

const color = computed(() => props.asset.color || ASSET_DEFAULT_COLOR[props.asset.kind]);
const ICON = ASSET_KIND_ICON;

const className: Record<Asset["kind"], string> = {
  generator: "Generator",
  storage: "Storage",
  load: "Load",
  market: "EnergyMarket",
};

const badges = computed<string[]>(() => {
  const a = props.asset;
  if (a.kind === "generator") return a.unit_commitment ? ["UC"] : [];
  if (a.kind === "load") return [a.type === "flexible" ? "Flexible" : "Fixed"];
  if (a.kind === "market") return [a.stage_fixed ? "stage_fixed" : "per-scenario"];
  return [];
});

const barPct = computed(() => {
  if (props.asset.kind !== "generator") return 0;
  return Math.min(100, (props.asset.nominal_power / Math.max(1, props.maxGeneratorPower)) * 100);
});

const minPct = computed(() => {
  if (props.asset.kind !== "generator" || !props.asset.unit_commitment) return null;
  return Math.min(100, (props.asset.min_power / Math.max(1, props.maxGeneratorPower)) * 100);
});

const facts = computed(() => {
  const a = props.asset;
  if (a.kind === "generator") {
    const out = [
      { k: "Nominal power", v: `${a.nominal_power} MW` },
      { k: "Variable cost", v: fmtPrice(a.variable_cost, 0) },
    ];
    if (a.unit_commitment) {
      out.push({ k: "Min up / down", v: `${a.min_up_time} / ${a.min_down_time} steps` });
      out.push({ k: "Startup cost", v: `$${a.startup_cost}` });
    }
    return out;
  }
  if (a.kind === "storage") {
    return [
      { k: "Capacity", v: `${a.capacity} MWh` },
      { k: "Max power", v: `${a.max_power} MW` },
      { k: "Duration", v: `${(a.capacity / a.max_power).toFixed(1)} h` },
      { k: "Round-trip", v: `${Math.round(a.efficiency_charging * a.efficiency_discharging * 100)}%` },
    ];
  }
  if (a.kind === "load") {
    if (a.type === "fixed") return [{ k: "Behaviour", v: "met exactly" }];
    return [
      { k: "Cost to increase", v: `${a.variable_cost_to_increase} $/MWh` },
      { k: "Cost to decrease", v: `${a.variable_cost_to_decrease} $/MWh` },
    ];
  }
  return [
    { k: "Max volume", v: `${a.max_trading_volume_per_step} MW` },
    { k: "Direction", v: a.trade_direction },
  ];
});
</script>

<template>
  <button
    type="button"
    class="flex flex-col gap-3.5 rounded-lg border border-default bg-default p-3.5 text-left transition hover:border-accented focus-visible:outline-2"
    :aria-label="`Edit ${asset.name}`"
    @click="$emit('click')"
  >
    <div class="flex w-full items-center gap-2.5">
      <span
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
        :style="{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }"
      >
        <UIcon :name="ICON[asset.kind]" class="size-[18px]" />
      </span>
      <span class="flex min-w-0 flex-col">
        <span class="truncate text-sm font-semibold text-highlighted">{{ asset.name }}</span>
        <span class="font-mono text-xs text-dimmed">{{ className[asset.kind] }}</span>
      </span>
      <span class="ml-auto flex gap-1">
        <span
          v-for="b in badges"
          :key="b"
          class="inline-flex h-5 items-center rounded-md bg-elevated px-1.5 font-mono text-xs text-default"
        >
          {{ b }}
        </span>
      </span>
    </div>

    <div v-if="asset.kind === 'generator'" class="flex w-full flex-col gap-1">
      <div class="relative h-2 rounded-full bg-elevated">
        <div class="absolute inset-y-0 left-0 rounded-full" :style="{ width: `${barPct}%`, background: color }" />
        <div v-if="minPct !== null" class="absolute -top-0.5 -bottom-0.5 w-0.5 bg-inverted" :style="{ left: `${minPct}%` }" />
      </div>
      <span class="font-mono text-xs text-muted">
        {{ asset.nominal_power }} MW<template v-if="asset.unit_commitment"> · min_power {{ asset.min_power }}</template>
      </span>
    </div>

    <div v-else-if="asset.kind === 'storage'" class="flex w-full flex-col gap-1">
      <div class="relative h-2 overflow-hidden rounded-full bg-elevated">
        <div
          class="absolute inset-y-0 bg-fuchsia-200 dark:bg-fuchsia-900"
          :style="{ left: `${asset.soc_min * 100}%`, width: `${(asset.soc_max - asset.soc_min) * 100}%` }"
        />
        <div class="absolute -top-0.5 -bottom-0.5 w-0.5 bg-fuchsia-600" :style="{ left: `${asset.soc_start * 100}%` }" />
      </div>
      <span class="font-mono text-xs text-muted">
        soc {{ asset.soc_min }}–{{ asset.soc_max }} · start {{ asset.soc_start }}
      </span>
    </div>

    <div class="grid w-full grid-cols-2 gap-x-3 gap-y-2 border-t border-muted pt-3">
      <span v-for="f in facts" :key="f.k" class="flex flex-col gap-0.5">
        <span class="text-xs text-muted">{{ f.k }}</span>
        <span class="font-mono text-sm text-highlighted">{{ f.v }}</span>
      </span>
    </div>
  </button>
</template>
