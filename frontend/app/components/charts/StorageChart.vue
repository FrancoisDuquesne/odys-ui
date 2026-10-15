<script setup lang="ts">
import type { ScenarioResults, StorageAsset } from "~/types";

const props = defineProps<{ scenario: ScenarioResults; storages: StorageAsset[]; stepHours?: number }>();
const { c, xAxis, yAxis, tooltip } = useChartTheme();
const hrs = computed(() => props.stepHours ?? 1);

// odys's StorageDispatch.soc docstring says "State of charge (MWh)", but verified
// empirically (curl against a seeded run): values track soc_start/soc_min/soc_max
// exactly as fractions of capacity (0-1). Trust the data, not the docstring --
// multiplying by capacity here would be a second SoC-units bug.
function socOption(storage: StorageAsset) {
  const d = props.scenario.storages[storage.name];
  if (!d) return {};
  return {
    grid: { left: 56, right: 16, top: 24, bottom: 24 },
    tooltip: tooltip({ valueFormatter: (v: number) => `${Number(v).toFixed(0)}%` }),
    xAxis: xAxis(stepLabels(d.soc.length, hrs.value), { axisLabel: { show: false } }),
    yAxis: yAxis("Charge level", { min: 0, max: 100, axisLabel: { color: c.value.text, fontSize: 12, formatter: "{value}%" } }),
    series: [
      {
        type: "line",
        data: d.soc.map((v) => v * 100),
        symbol: "none",
        lineStyle: { width: 2, color: c.value.strong },
        itemStyle: { color: c.value.strong },
        areaStyle: { color: c.value.strong, opacity: 0.08 },
        markArea: {
          silent: true,
          itemStyle: { color: c.value.text, opacity: 0.07 },
          data: [[{ yAxis: storage.soc_min * 100 }, { yAxis: storage.soc_max * 100 }]],
        },
        markLine:
          storage.soc_end !== null
            ? {
                silent: true,
                symbol: "none",
                lineStyle: { type: "dashed", color: c.value.strong },
                data: [{ yAxis: storage.soc_end * 100 }],
                label: { formatter: "Target end level", color: c.value.text },
              }
            : undefined,
      },
    ],
  };
}

function powerOption(storage: StorageAsset) {
  const d = props.scenario.storages[storage.name];
  if (!d) return {};
  return {
    grid: { left: 56, right: 16, top: 24, bottom: 28 },
    tooltip: tooltip({ valueFormatter: (v: number) => `${fmtMW(Number(v), 1)} ${Number(v) >= 0 ? "(discharging)" : "(charging)"}` }),
    xAxis: xAxis(stepLabels(d.net_power.length, hrs.value)),
    yAxis: yAxis("MW"),
    series: [
      {
        type: "bar",
        data: d.net_power,
        itemStyle: { color: (p: { value: number }) => (p.value >= 0 ? SERIES.storageDischarge : SERIES.storageCharge) },
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: c.value.text, width: 1 },
          label: { position: "insideStartBottom", formatter: "Charging below ↓", color: c.value.text, fontSize: 11 },
          data: [{ yAxis: 0 }],
        },
      },
    ],
  };
}

function stats(storage: StorageAsset) {
  const d = props.scenario.storages[storage.name];
  if (!d) return null;
  const throughput = sum(d.net_power.map(Math.abs)) * hrs.value;
  return {
    throughput,
    cycles: throughput / 2 / storage.capacity,
    finalSoc: (d.soc.at(-1) ?? 0) * storage.capacity,
    target: storage.soc_end !== null ? storage.soc_end * storage.capacity : null,
    degCost: storage.degradation_cost ? throughput * storage.degradation_cost : 0,
  };
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <Panel v-for="storage in storages" :key="storage.name" :title="storage.name" :description="`${fmtMWh(storage.capacity)} · ${fmtMW(storage.max_power)} · allowed charge range ${fmtPct(storage.soc_min)}–${fmtPct(storage.soc_max)}`">
      <template v-if="stats(storage)" #actions>
        <dl class="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
          <div><dt class="inline">Throughput </dt><dd class="inline font-mono text-default">{{ fmtMWh(stats(storage)!.throughput) }}</dd></div>
          <div><dt class="inline">Cycles </dt><dd class="inline font-mono text-default">{{ stats(storage)!.cycles.toFixed(2) }}</dd></div>
          <div>
            <dt class="inline">Final charge </dt>
            <dd class="inline font-mono text-default">{{ fmtMWh(stats(storage)!.finalSoc) }}<template v-if="stats(storage)!.target !== null"> / target {{ fmtMWh(stats(storage)!.target) }}</template></dd>
          </div>
          <div v-if="stats(storage)!.degCost"><dt class="inline">Degradation </dt><dd class="inline font-mono text-default">{{ fmtMoneyFull(stats(storage)!.degCost) }}</dd></div>
        </dl>
      </template>
      <VChart :option="socOption(storage)" autoresize style="height: 150px" />
      <VChart :option="powerOption(storage)" autoresize style="height: 120px" />
      <p class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span>Charge level over time; the shaded band is the allowed range.</span>
        <span class="flex items-center gap-1.5"><span class="size-2.5 rounded-sm" :style="{ background: SERIES.storageDischarge }" />Discharging</span>
        <span class="flex items-center gap-1.5"><span class="size-2.5 rounded-sm" :style="{ background: SERIES.storageCharge }" />Charging</span>
      </p>
    </Panel>
    <EmptyState v-if="storages.length === 0" icon="i-lucide-battery" title="No storage in this portfolio" />
  </div>
</template>
