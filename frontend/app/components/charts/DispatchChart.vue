<script setup lang="ts">
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

const { c, xAxis, yAxis, tooltip, legend } = useChartTheme();

const totalLoad = computed(() => {
  const out: number[] = new Array(props.steps).fill(0);
  for (const profile of Object.values(props.loadProfiles)) {
    for (let t = 0; t < props.steps; t++) out[t] += profile[t] ?? 0;
  }
  return out;
});

const option = computed(() => {
  const series: any[] = [];
  const bar = (name: string, stack: string, data: number[], color: string) =>
    series.push({ name, type: "bar", stack, data, itemStyle: { color }, barCategoryGap: "25%", emphasis: { focus: "series" } });

  const s = props.scenario;
  for (const [name, d] of Object.entries(s.generators)) bar(name, "pos", d.power, props.assetColors[name] ?? ASSET_DEFAULT_COLOR.generator);
  for (const [name, d] of Object.entries(s.storages)) bar(`${name} discharge`, "pos", d.net_power.map((v) => Math.max(0, v)), SERIES.storageDischarge);
  for (const [name, d] of Object.entries(s.markets)) bar(`${name} buy`, "pos", d.buy_volume, SERIES.marketBuy);
  for (const [name, d] of Object.entries(s.storages)) bar(`${name} charge`, "neg", d.net_power.map((v) => Math.min(0, v)), SERIES.storageCharge);
  for (const [name, d] of Object.entries(s.markets)) bar(`${name} sell`, "neg", d.sell_volume.map((v) => -v), SERIES.marketSell);

  series.push({
    name: "Total load",
    type: "line",
    step: "middle",
    data: totalLoad.value,
    symbol: "none",
    lineStyle: { width: 2, color: c.value.strong },
    itemStyle: { color: c.value.strong },
    z: 10,
  });

  const price = Object.values(props.marketPrices)[0];
  if (price) {
    series.push({
      name: "Price",
      type: "line",
      data: price,
      yAxisIndex: 1,
      symbol: "none",
      lineStyle: { width: 1.25, type: "dashed", color: SERIES.price },
      itemStyle: { color: SERIES.price },
      tooltip: { valueFormatter: (v: number) => fmtPrice(Number(v)) },
    });
  }

  return {
    grid: { left: 56, right: price ? 56 : 16, top: 56, bottom: 28 },
    legend: legend(series.map((x) => x.name)),
    tooltip: tooltip({ valueFormatter: (v: number) => fmtMW(Number(v), 1) }),
    xAxis: xAxis(stepLabels(props.steps, props.stepHours)),
    yAxis: [
      yAxis("MW", { min: props.yRange?.[0], max: props.yRange?.[1] }),
      yAxis("$/MWh", { show: !!price, splitLine: { show: false }, nameTextStyle: { align: "right", color: c.value.muted } }),
    ],
    series,
  };
});
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <VChart :option="option" autoresize :style="{ height: `${height}px` }" />
    <p class="text-xs text-dimmed">Supply stacks above zero; exports and charging below. Line = total load. Click legend items to toggle series.</p>
  </div>
</template>
