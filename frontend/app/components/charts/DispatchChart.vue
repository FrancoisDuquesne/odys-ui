<script setup lang="ts">
import { ref } from "vue";
import type { ScenarioResults } from "~/types";

const props = withDefaults(
  defineProps<{
    scenario: ScenarioResults;
    loadProfiles: Record<string, number[]>;
    marketPrices: Record<string, number[]>;
    assetColors: Record<string, string>;
    steps: number;
    stepHours?: number;
    yRange?: [number, number];
    height?: number;
  }>(),
  { stepHours: 1, height: 300 },
);

const { c, xAxis, yAxis, tooltip, tipRow } = useChartTheme();

const totalLoad = computed(() => {
  const out: number[] = new Array(props.steps).fill(0);
  for (const profile of Object.values(props.loadProfiles)) {
    for (let t = 0; t < props.steps; t++) out[t] += profile[t] ?? 0;
  }
  return out;
});

type Group = { title: string; items: { name: string; color: string; line?: "solid" | "dashed" }[] };

const price = computed(() => Object.values(props.marketPrices)[0]);

// Series are described once; legend, chart and tooltip all derive from this.
const groups = computed<Group[]>(() => {
  const s = props.scenario;
  const supply = Object.keys(s.generators).map((n) => ({ name: n, color: props.assetColors[n] ?? ASSET_DEFAULT_COLOR.generator }));
  const storage = Object.keys(s.storages).flatMap((n) => [
    { name: `${n} discharge`, color: SERIES.storageDischarge },
    { name: `${n} charge`, color: SERIES.storageCharge },
  ]);
  const market = Object.keys(s.markets).flatMap((n) => [
    { name: `${n} buy (import)`, color: SERIES.marketBuy },
    { name: `${n} sell (export)`, color: SERIES.marketSell },
  ]);
  const ref: Group["items"] = [{ name: "Total load", color: c.value.strong, line: "solid" }];
  if (price.value) ref.push({ name: "Market price", color: SERIES.price, line: "dashed" });
  return [
    { title: "Generation", items: supply },
    { title: "Storage", items: storage },
    { title: "Market", items: market },
    { title: "Reference", items: ref },
  ].filter((g) => g.items.length);
});

const hidden = ref(new Set<string>());
function toggle(name: string) {
  const next = new Set(hidden.value);
  if (!next.delete(name)) next.add(name);
  hidden.value = next;
}

const option = computed(() => {
  const series: any[] = [];
  const bar = (name: string, stack: string, data: number[], color: string) =>
    series.push({ name, type: "bar", stack, data, itemStyle: { color }, barCategoryGap: "25%", emphasis: { focus: "series" } });

  const s = props.scenario;
  for (const [name, d] of Object.entries(s.generators)) bar(name, "pos", d.power, props.assetColors[name] ?? ASSET_DEFAULT_COLOR.generator);
  for (const [name, d] of Object.entries(s.storages)) bar(`${name} discharge`, "pos", d.net_power.map((v) => Math.max(0, v)), SERIES.storageDischarge);
  for (const [name, d] of Object.entries(s.markets)) bar(`${name} buy (import)`, "pos", d.buy_volume, SERIES.marketBuy);
  for (const [name, d] of Object.entries(s.storages)) bar(`${name} charge`, "neg", d.net_power.map((v) => Math.min(0, v)), SERIES.storageCharge);
  for (const [name, d] of Object.entries(s.markets)) bar(`${name} sell (export)`, "neg", d.sell_volume.map((v) => -v), SERIES.marketSell);

  series.push({
    name: "Total load",
    type: "line",
    step: "middle",
    data: totalLoad.value,
    symbol: "none",
    lineStyle: { width: 2, color: c.value.strong },
    itemStyle: { color: c.value.strong },
    z: 10,
    markLine: {
      silent: true,
      symbol: "none",
      lineStyle: { color: c.value.text, width: 1, type: "solid" },
      label: { show: false },
      data: [{ yAxis: 0 }],
    },
  });

  if (price.value) {
    series.push({
      name: "Market price",
      type: "line",
      data: price.value,
      yAxisIndex: 1,
      symbol: "none",
      lineStyle: { width: 1.5, type: "dashed", color: SERIES.price },
      itemStyle: { color: SERIES.price },
    });
  }

  const selected: Record<string, boolean> = {};
  for (const n of hidden.value) selected[n] = false;

  return {
    grid: { left: 56, right: price.value ? 60 : 16, top: 32, bottom: 28 },
    legend: { show: false, data: series.map((x) => x.name), selected },
    tooltip: tooltip({
      formatter: (params: any[]) => {
        const rows = params
          .filter((p) => p.seriesName === "Market price" || p.seriesName === "Total load" || Math.abs(Number(p.value)) > 1e-6)
          .map((p) =>
            tipRow(
              p.color,
              p.seriesName,
              p.seriesName === "Market price" ? fmtPrice(Number(p.value)) : fmtMW(Number(p.value), 1),
            ),
          );
        return `<div style="min-width:200px"><div style="font-weight:600;margin-bottom:4px">${params[0]?.axisValueLabel ?? ""}</div>${rows.join("")}</div>`;
      },
    }),
    xAxis: xAxis(stepLabels(props.steps, props.stepHours)),
    yAxis: [
      yAxis("MW", { min: props.yRange?.[0], max: props.yRange?.[1] }),
      yAxis("$/MWh", { show: !!price.value, splitLine: { show: false }, nameTextStyle: { align: "right", color: c.value.text, fontFamily: "IBM Plex Mono, ui-monospace, monospace", fontSize: 12 } }),
    ],
    series,
  };
});
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex flex-wrap gap-x-5 gap-y-1.5" role="group" aria-label="Chart legend, click to show or hide a series">
      <div v-for="g in groups" :key="g.title" class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span class="text-xs font-medium uppercase tracking-wide text-muted">{{ g.title }}</span>
        <button
          v-for="it in g.items"
          :key="it.name"
          type="button"
          class="flex items-center gap-1.5 rounded text-xs text-default transition-opacity hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary"
          :class="hidden.has(it.name) ? 'opacity-40 line-through' : ''"
          :aria-pressed="!hidden.has(it.name)"
          @click="toggle(it.name)"
        >
          <span v-if="it.line" class="w-3.5 border-t-2" :style="{ borderColor: it.color, borderTopStyle: it.line }" />
          <span v-else class="size-2.5 rounded-sm" :style="{ background: it.color }" />
          {{ it.name }}
        </button>
      </div>
    </div>
    <VChart :option="option" autoresize :style="{ height: `${height}px` }" />
    <p class="text-xs text-muted">Supply stacks above zero; exports and charging below. Click a legend item to show or hide it.</p>
  </div>
</template>
