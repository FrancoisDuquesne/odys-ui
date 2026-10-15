<script setup lang="ts">
const props = defineProps<{ planned: number[]; actual: number[] | null; stepHours: number }>();
const { c, xAxis, yAxis, tooltip, legend } = useChartTheme();

const option = computed(() => ({
  grid: { left: 48, right: 8, top: 56, bottom: 24 },
  legend: legend(undefined, { top: 0, left: "right" }),
  tooltip: tooltip({ valueFormatter: (v: number) => `${Number(v).toFixed(1)} MW` }),
  xAxis: xAxis(stepLabels(props.planned.length, props.stepHours)),
  yAxis: yAxis("MW"),
  series: [
    {
      name: "Planned net export",
      type: "line",
      data: props.planned,
      symbol: "none",
      lineStyle: { width: 2, color: SERIES.planned },
      itemStyle: { color: SERIES.planned },
      markLine: { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: c.value.axis }, data: [{ yAxis: 0 }] },
    },
    ...(props.actual
      ? [
          {
            name: "Metered (uploaded)",
            type: "line",
            data: props.actual,
            symbol: "none",
            lineStyle: { width: 1.5, type: "dashed", color: c.value.strong },
            itemStyle: { color: c.value.strong },
          },
        ]
      : []),
  ],
}));
</script>

<template>
  <VChart :option="option" autoresize style="height: 190px" />
</template>
