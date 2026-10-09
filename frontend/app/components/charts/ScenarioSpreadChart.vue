<script setup lang="ts">
import type { RunResults } from "~/types";

const props = defineProps<{ results: RunResults; selectedScenario: string; confidenceLevel: number | null; stepHours?: number }>();
const { c, xAxis, yAxis, tooltip } = useChartTheme();

const sorted = computed(() =>
  [...props.results.scenarios].map((s) => ({ ...s, profit: props.results.profit_by_scenario[s.name] })).sort((a, b) => a.profit - b.profit),
);
const tailMass = computed(() => 1 - (props.confidenceLevel ?? 0.95));

const barOption = computed(() => {
  let cum = 0;
  const data = sorted.value.map((s) => {
    const inTail = cum < tailMass.value;
    cum += s.probability;
    return { value: s.profit, itemStyle: { color: inTail ? SERIES.tail : c.value.muted } };
  });
  return {
    grid: { left: 64, right: 16, top: 24, bottom: 56 },
    tooltip: tooltip({ valueFormatter: (v: number) => fmtMoneyFull(v) }),
    xAxis: xAxis(sorted.value.map((s) => `${s.name} (p=${s.probability.toFixed(2)})`), { axisLabel: { color: c.value.text, fontSize: 12, interval: 0, rotate: 20 } }),
    yAxis: yAxis("Profit $", { axisLabel: { color: c.value.text, fontSize: 12, formatter: (v: number) => fmtMoney(v) } }),
    series: [{ type: "bar", data, barMaxWidth: 40 }],
  };
});

const storageName = computed(() => {
  const first = Object.values(props.results.by_scenario)[0];
  return first ? Object.keys(first.storages)[0] : null;
});

const socOption = computed(() => {
  if (!storageName.value) return {};
  const n = props.results.number_of_steps;
  return {
    grid: { left: 56, right: 16, top: 24, bottom: 28 },
    tooltip: tooltip({ valueFormatter: (v: number) => `${Number(v).toFixed(0)}%` }),
    xAxis: xAxis(stepLabels(n, props.stepHours ?? 1)),
    yAxis: yAxis("SoC", { min: 0, max: 100, axisLabel: { color: c.value.text, fontSize: 12, formatter: "{value}%" } }),
    series: Object.entries(props.results.by_scenario).map(([name, s]) => {
      const selected = name === props.selectedScenario;
      return {
        name,
        type: "line",
        symbol: "none",
        // soc is a fraction of capacity (0-1), not MWh -- see StorageChart.vue.
        data: (s.storages[storageName.value!]?.soc ?? []).map((v) => v * 100),
        lineStyle: { width: selected ? 2.5 : 1, color: selected ? SERIES.storageDischarge : c.value.axis },
        itemStyle: { color: selected ? SERIES.storageDischarge : c.value.axis },
        z: selected ? 10 : 1,
      };
    }),
  };
});
</script>

<template>
  <div class="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-4">
    <Panel title="Profit by scenario" description="Sorted worst → best. Red bars are the CVaR tail.">
      <VChart :option="barOption" autoresize style="height: 240px" />
      <template #footer>
        <span class="font-mono">E[profit] {{ fmtMoney(results.expected_profit) }}</span>
        <span v-if="results.cvar !== null" class="ml-4 font-mono">CVaR {{ fmtMoney(results.cvar) }}</span>
      </template>
    </Panel>
    <Panel v-if="storageName" :title="`${storageName} SoC across scenarios`" description="Selected scenario highlighted">
      <VChart :option="socOption" autoresize style="height: 240px" />
    </Panel>
  </div>
</template>
