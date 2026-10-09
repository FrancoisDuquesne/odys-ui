<script setup lang="ts">
import type { GeneratorAsset, ScenarioResults } from "~/types";

const props = defineProps<{
  scenario: ScenarioResults;
  generators: GeneratorAsset[];
  loadProfiles: Record<string, number[]>;
  assetColors: Record<string, string>;
  stepHours: number;
}>();

const h = computed(() => props.stepHours);
const energy = (xs: number[]) => sum(xs) * h.value;

const supply = computed(() => {
  const rows: { name: string; color: string; mwh: number; peak: number; cf: number | null }[] = [];
  const horizon = (props.scenario.generators[Object.keys(props.scenario.generators)[0]]?.power.length ?? 0) * h.value;
  for (const [name, d] of Object.entries(props.scenario.generators)) {
    const cap = props.generators.find((g) => g.name === name)?.nominal_power;
    const mwh = energy(d.power);
    rows.push({ name, color: props.assetColors[name] ?? SERIES.neutral, mwh, peak: Math.max(0, ...d.power), cf: cap && horizon ? mwh / (cap * horizon) : null });
  }
  for (const [name, d] of Object.entries(props.scenario.storages)) {
    const dis = d.net_power.map((v) => Math.max(0, v));
    rows.push({ name: `${name} discharge`, color: SERIES.storageDischarge, mwh: energy(dis), peak: Math.max(0, ...dis), cf: null });
  }
  for (const [name, d] of Object.entries(props.scenario.markets)) {
    rows.push({ name: `${name} imports`, color: SERIES.marketBuy, mwh: energy(d.buy_volume), peak: Math.max(0, ...d.buy_volume), cf: null });
  }
  return rows;
});

const demand = computed(() => {
  const rows: { name: string; color: string; mwh: number; peak: number }[] = [];
  const loadMwh = sum(Object.values(props.loadProfiles).flatMap((p) => p)) * h.value;
  const loadPeak = Math.max(0, ...Object.values(props.loadProfiles).flatMap((p) => p));
  rows.push({ name: "Load", color: "#475569", mwh: loadMwh, peak: loadPeak });
  for (const [name, d] of Object.entries(props.scenario.storages)) {
    const ch = d.net_power.map((v) => Math.max(0, -v));
    rows.push({ name: `${name} charge`, color: SERIES.storageCharge, mwh: energy(ch), peak: Math.max(0, ...ch) });
  }
  for (const [name, d] of Object.entries(props.scenario.markets)) {
    rows.push({ name: `${name} exports`, color: SERIES.marketSell, mwh: energy(d.sell_volume), peak: Math.max(0, ...d.sell_volume) });
  }
  return rows;
});

const totalSupply = computed(() => supply.value.reduce((s, r) => s + r.mwh, 0));
const totalDemand = computed(() => demand.value.reduce((s, r) => s + r.mwh, 0));
</script>

<template>
  <div class="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-4">
    <Panel title="Supply" description="Energy delivered over the horizon" flush>
      <table class="w-full text-sm">
        <thead class="text-left text-xs text-muted">
          <tr><th class="px-4 py-2 font-medium">Source</th><th class="px-3 py-2 text-right font-medium">Energy</th><th class="px-3 py-2 text-right font-medium">Share</th><th class="px-3 py-2 text-right font-medium">Peak</th><th class="px-4 py-2 text-right font-medium">Cap. factor</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in supply" :key="r.name" class="border-t border-muted">
            <td class="px-4 py-2"><span class="mr-2 inline-block size-2 rounded-sm" :style="{ background: r.color }" />{{ r.name }}</td>
            <td class="px-3 py-2 text-right font-mono">{{ fmtMWh(r.mwh) }}</td>
            <td class="px-3 py-2 text-right font-mono text-muted">{{ fmtPct(totalSupply ? r.mwh / totalSupply : 0) }}</td>
            <td class="px-3 py-2 text-right font-mono text-muted">{{ fmtMW(r.peak) }}</td>
            <td class="px-4 py-2 text-right font-mono text-muted">{{ r.cf === null ? "—" : fmtPct(r.cf) }}</td>
          </tr>
          <tr class="border-t border-default font-medium"><td class="px-4 py-2">Total</td><td class="px-3 py-2 text-right font-mono">{{ fmtMWh(totalSupply) }}</td><td colspan="3" /></tr>
        </tbody>
      </table>
    </Panel>
    <Panel title="Demand & outflows" description="Where the energy went" flush>
      <table class="w-full text-sm">
        <thead class="text-left text-xs text-muted">
          <tr><th class="px-4 py-2 font-medium">Sink</th><th class="px-3 py-2 text-right font-medium">Energy</th><th class="px-3 py-2 text-right font-medium">Share</th><th class="px-4 py-2 text-right font-medium">Peak</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in demand" :key="r.name" class="border-t border-muted">
            <td class="px-4 py-2"><span class="mr-2 inline-block size-2 rounded-sm" :style="{ background: r.color }" />{{ r.name }}</td>
            <td class="px-3 py-2 text-right font-mono">{{ fmtMWh(r.mwh) }}</td>
            <td class="px-3 py-2 text-right font-mono text-muted">{{ fmtPct(totalDemand ? r.mwh / totalDemand : 0) }}</td>
            <td class="px-4 py-2 text-right font-mono text-muted">{{ fmtMW(r.peak) }}</td>
          </tr>
          <tr class="border-t border-default font-medium"><td class="px-4 py-2">Total</td><td class="px-3 py-2 text-right font-mono">{{ fmtMWh(totalDemand) }}</td><td colspan="2" /></tr>
        </tbody>
      </table>
      <template #footer>
        Supply − outflows: <span class="font-mono text-default">{{ fmtMWh(totalSupply - totalDemand, 1) }}</span>.
        A non-zero difference may reflect storage losses or flexible-load adjustments.
      </template>
    </Panel>
  </div>
</template>
