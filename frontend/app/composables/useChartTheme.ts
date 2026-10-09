// ECharts draws to <canvas>, which cannot resolve CSS variables, so the theme
// is resolved to concrete colours and follows the colour mode.
export function useChartTheme() {
  const mode = useColorMode();
  const dark = computed(() => mode.value === "dark");

  const c = computed(() => ({
    text: dark.value ? "#cbd5e1" : "#475569",
    strong: dark.value ? "#f1f5f9" : "#0f172a",
    muted: dark.value ? "#64748b" : "#94a3b8",
    grid: dark.value ? "#1e293b" : "#e2e8f0",
    axis: dark.value ? "#334155" : "#cbd5e1",
    surface: dark.value ? "#0f172a" : "#ffffff",
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
      nameTextStyle: { ...font, color: c.value.muted, align: "left" },
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

  function legend(data?: string[], extra: Record<string, unknown> = {}) {
    return {
      data,
      top: 0,
      left: 48,
      icon: "roundRect",
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 14,
      textStyle: { color: c.value.text, fontSize: 13, fontFamily: "IBM Plex Sans, ui-sans-serif, sans-serif" },
      inactiveColor: c.value.axis,
      ...extra,
    };
  }

  return { c, dark, font, xAxis, yAxis, tooltip, legend };
}
