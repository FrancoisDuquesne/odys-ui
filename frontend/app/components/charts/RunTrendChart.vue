<script setup lang="ts">
const props = defineProps<{ points: { id: string; label: string; value: number }[] }>();
const { c, xAxis, yAxis, tooltip } = useChartTheme();

const option = computed(() => ({
  grid: { left: 56, right: 8, top: 24, bottom: 36 },
  tooltip: tooltip({ trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: number) => fmtMoneyFull(v) }),
  xAxis: xAxis(props.points.map((p) => `${p.id}\n${p.label}`), { axisLabel: { color: c.value.text, fontSize: 12, interval: 0 } }),
  yAxis: yAxis(undefined, { splitNumber: 3, axisLabel: { color: c.value.text, fontSize: 12, formatter: (v: number) => fmtMoney(v) } }),
  series: [
    {
      type: "bar",
      barMaxWidth: 36,
      data: props.points.map((p) => p.value),
      itemStyle: { color: c.value.muted, borderRadius: 2 },
      label: { show: true, position: "top", formatter: (p: { value: number }) => fmtMoney(p.value), color: c.value.text, fontSize: 12 },
    },
  ],
}));
</script>

<template>
  <VChart :option="option" autoresize style="height: 170px" />
</template>
