<script setup lang="ts">
// One profile (a load, a market price or a generator's availability) over the planning horizon,
// with one line per scenario so alternative futures can be compared at a glance.
const props = defineProps<{
  series: { name: string; color: string; data: number[] }[];
  unit: string;
  stepHours: number;
  /** Fill under the line when there is a single series. */
  area?: boolean;
}>();
const { xAxis, yAxis, tooltip, legend } = useChartTheme();

const option = computed(() => {
  const n = props.series[0]?.data.length ?? 0;
  const many = props.series.length > 1;
  return {
    grid: { left: 52, right: 16, top: many ? 44 : 28, bottom: 28 },
    legend: many ? legend(props.series.map((s) => s.name)) : { show: false },
    tooltip: tooltip({ valueFormatter: (v: number) => `${fmtNum(Number(v), 1)} ${props.unit}` }),
    xAxis: xAxis(stepLabels(n, props.stepHours)),
    yAxis: yAxis(props.unit),
    series: props.series.map((s) => ({
      name: s.name,
      type: "line",
      data: s.data,
      step: "end",
      symbol: "none",
      lineStyle: { width: 2, color: s.color },
      itemStyle: { color: s.color },
      areaStyle: props.area && !many ? { color: s.color, opacity: 0.12 } : undefined,
    })),
  };
});
</script>

<template>
  <VChart :option="option" autoresize style="height: 200px" />
</template>
