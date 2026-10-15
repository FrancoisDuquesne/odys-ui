<script setup lang="ts">
import type { Run } from "~/types";

const props = defineProps<{ runs: Run[]; currentRun: Run; sweeping?: boolean }>();
defineEmits<{ sweep: [] }>();
const { c, yAxis, tooltip } = useChartTheme();

const points = computed(() =>
  [...props.runs]
    .filter((r) => r.results)
    .map((r) => ({
      run: r,
      cvar: r.results!.cvar ?? r.results!.expected_profit,
      profit: r.results!.expected_profit,
      weight: r.objective.cvar?.weight ?? 0,
    }))
    .sort((a, b) => a.weight - b.weight),
);
const isCurrent = (i: number) => points.value[i]?.run.id === props.currentRun.id;

const option = computed(() => ({
  grid: { left: 76, right: 24, top: 24, bottom: 48 },
  tooltip: tooltip({
    trigger: "item",
    formatter: (p: any) => `<b>${p.data.run.display_id}</b> · risk weight ${p.data.weight}<br/>Expected profit ${fmtMoneyFull(p.data.profit)}<br/>Tail-risk (CVaR) profit ${fmtMoneyFull(p.data.cvar)}`,
  }),
  xAxis: { ...yAxis("", { name: "Tail-risk profit, CVaR ($)", nameLocation: "middle", nameGap: 32, axisLabel: { color: c.value.text, fontSize: 12, formatter: (v: number) => fmtMoney(v) } }) },
  yAxis: yAxis("Expected profit ($)", { axisLabel: { color: c.value.text, fontSize: 12, formatter: (v: number) => fmtMoney(v) } }),
  series: [
    {
      type: "line",
      data: points.value.map((p) => ({ value: [p.cvar, p.profit], ...p })),
      lineStyle: { type: "dashed", color: c.value.axis },
      symbol: "circle",
      symbolSize: (_: unknown, ctx: any) => (isCurrent(ctx.dataIndex) ? 12 : 7),
      itemStyle: { color: (ctx: any) => (isCurrent(ctx.dataIndex) ? SERIES.good : c.value.muted) },
      label: {
        show: true,
        position: "top",
        color: c.value.text,
        fontSize: 12,
        formatter: (ctx: any) => `${points.value[ctx.dataIndex]?.weight}`,
      },
    },
  ],
}));
</script>

<template>
  <Panel title="Risk frontier" description="Expected profit against tail-risk profit (CVaR), one point per run. Labels show the risk weight; the green point is this run.">
    <template #actions>
      <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-refresh-cw" :loading="sweeping" label="Run sweep" @click="$emit('sweep')" />
    </template>
    <VChart v-if="points.length > 1" :option="option" autoresize style="height: 320px" />
    <EmptyState
      v-else
      icon="i-lucide-radar"
      title="No sweep yet"
      description="Run a sweep to solve this portfolio and scenario set across risk weights 0 – 4 and trace the trade-off between expected profit and tail risk."
    />
    <template #footer>A sweep creates six new runs in this project's history.</template>
  </Panel>
</template>
