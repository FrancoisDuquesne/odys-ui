<script setup lang="ts">
const props = defineProps<{ points: { id: string; label: string; value: number }[] }>();
const { c, xAxis, yAxis, tooltip } = useChartTheme();

const bestIndex = computed(() => {
  let best = 0;
  props.points.forEach((p, i) => {
    if (p.value > props.points[best]!.value) best = i;
  });
  return best;
});

const option = computed(() => {
  const baseline = props.points[0]?.value ?? 0;
  const values = props.points.map((p) => p.value);
  const min = Math.min(...values, baseline);
  const max = Math.max(...values, baseline);
  // Pad so a flat series still gets a readable axis instead of a degenerate range.
  const pad = Math.max((max - min) * 0.25, Math.abs(max) * 0.02, 1);
  return {
    grid: { left: 56, right: 56, top: 28, bottom: 36 },
    tooltip: tooltip({
      axisPointer: { type: "line" },
      formatter: (items: { dataIndex: number }[]) => {
        const p = props.points[items[0]!.dataIndex]!;
        return `<b>${p.id}</b> · ${p.label}<br/>${fmtMoneyFull(p.value)}`;
      },
    }),
    xAxis: xAxis(props.points.map((p) => p.id), { boundaryGap: false, axisLabel: { color: c.value.text, fontSize: 12, interval: 0, hideOverlap: true } }),
    yAxis: yAxis(undefined, {
      min: Math.floor(min - pad),
      max: Math.ceil(max + pad),
      splitNumber: 3,
      axisLabel: { color: c.value.text, fontSize: 12, formatter: (v: number) => fmtMoney(v) },
    }),
    series: [
      {
        type: "line",
        data: values.map((v, i) =>
          i === bestIndex.value
            ? { value: v, symbolSize: 11, itemStyle: { color: SERIES.planned, borderColor: c.value.strong, borderWidth: 2 }, label: { show: true, position: "top", formatter: "Best", offset: [22, 0], color: c.value.strong, fontSize: 12 } }
            : v,
        ),
        symbol: "circle",
        symbolSize: 7,
        lineStyle: { width: 2, color: SERIES.planned },
        itemStyle: { color: SERIES.planned, borderColor: c.value.surface, borderWidth: 2 },
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { type: "dashed", color: c.value.muted },
          label: { position: "insideEndTop", formatter: "Baseline", color: c.value.text, fontSize: 12 },
          data: [{ yAxis: baseline }],
        },
      },
    ],
  };
});
</script>

<template>
  <VChart :option="option" autoresize style="height: 190px" />
</template>
