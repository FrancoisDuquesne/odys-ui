// ECharts draws to <canvas>, which cannot resolve CSS variables, so the theme
// is resolved to concrete colours and follows the colour mode.
export function useChartTheme() {
  const mode = useColorMode();
  const dark = computed(() => mode.value === "dark");

  const c = computed(() => ({
    text: dark.value ? "#cfcbb5" : "#565971",
    strong: dark.value ? "#f4f1de" : "#212338",
    muted: dark.value ? "#9a9aa8" : "#676a82",
    grid: dark.value ? "#2e3047" : "#e6e2cc",
    axis: dark.value ? "#3d405b" : "#cfcbb5",
    surface: dark.value ? "#212338" : "#fdfcf6",
  }));

  const font = { fontFamily: "IBM Plex Mono, ui-monospace, monospace", fontSize: 12 };

  function xAxis(categories: string[], extra: Record<string, unknown> = {}) {
    return {
      type: "category",
      data: categories,
      boundaryGap: true,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: c.value.axis } },
      axisLabel: { ...font, color: c.value.text, hideOverlap: true },
      ...extra,
    };
  }

  function yAxis(name: string | undefined, extra: Record<string, unknown> = {}) {
    return {
      type: "value",
      name,
      nameTextStyle: { ...font, color: c.value.text, align: "left" },
      axisLabel: { ...font, color: c.value.text },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: c.value.grid } },
      ...extra,
    };
  }

  function tooltip(extra: Record<string, unknown> = {}) {
    return {
      trigger: "axis",
      backgroundColor: c.value.surface,
      borderColor: c.value.axis,
      textStyle: { color: c.value.strong, fontSize: 13, fontFamily: "IBM Plex Sans, ui-sans-serif, sans-serif" },
      extraCssText: "box-shadow:none;",
      confine: true,
      ...extra,
    };
  }

  // Tooltip row helper: coloured dot, label, right-aligned value.
  function tipRow(color: string, label: string, value: string) {
    return `<div style="display:flex;align-items:center;gap:8px;line-height:1.6"><span style="width:8px;height:8px;border-radius:2px;background:${color};flex:none"></span><span style="flex:1;color:${c.value.text}">${label}</span><b style="font-family:${font.fontFamily};font-weight:500;padding-left:12px">${value}</b></div>`;
  }

  function legend(data?: string[], extra: Record<string, unknown> = {}) {
    return {
      data,
      top: 0,
      left: 0,
      width: "100%",
      icon: "roundRect",
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 14,
      textStyle: { color: c.value.text, fontSize: 13, fontFamily: "IBM Plex Sans, ui-sans-serif, sans-serif" },
      inactiveColor: c.value.axis,
      ...extra,
    };
  }

  return { c, dark, font, xAxis, yAxis, tooltip, tipRow, legend };
}
