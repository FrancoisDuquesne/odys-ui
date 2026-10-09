<script setup lang="ts">
import type { MarketAsset, ScenarioResults } from "~/types";

const props = defineProps<{ scenario: ScenarioResults; markets: MarketAsset[]; marketPrices: Record<string, number[]>; stepHours?: number }>();
const { c, xAxis, yAxis, tooltip, legend } = useChartTheme();
const hrs = computed(() => props.stepHours ?? 1);

function option(market: MarketAsset) {
  const d = props.scenario.markets[market.name];
  if (!d) return {};
  const price = props.marketPrices[market.name];
  return {
    grid: { left: 56, right: price ? 56 : 16, top: 56, bottom: 28 },
    legend: legend(price ? ["Buy", "Sell", "Price"] : ["Buy", "Sell"]),
    tooltip: tooltip(),
    xAxis: xAxis(stepLabels(d.buy_volume.length, hrs.value)),
    yAxis: [yAxis("MW"), yAxis("$/MWh", { show: !!price, splitLine: { show: false }, nameTextStyle: { align: "right", color: c.value.muted } })],
    series: [
      { name: "Buy", type: "bar", stack: "m", data: d.buy_volume, itemStyle: { color: SERIES.marketBuy }, tooltip: { valueFormatter: (v: number) => fmtMW(Number(v), 1) } },
      { name: "Sell", type: "bar", stack: "m", data: d.sell_volume.map((v) => -v), itemStyle: { color: SERIES.marketSell }, tooltip: { valueFormatter: (v: number) => fmtMW(Math.abs(Number(v)), 1) } },
      ...(price
        ? [{ name: "Price", type: "line", data: price, yAxisIndex: 1, symbol: "none", lineStyle: { width: 1.5, color: SERIES.price }, itemStyle: { color: SERIES.price }, tooltip: { valueFormatter: (v: number) => fmtPrice(Number(v)) } }]
        : []),
    ],
  };
}

function stats(market: MarketAsset) {
  const d = props.scenario.markets[market.name];
  const price = props.marketPrices[market.name];
  if (!d) return null;
  const h = hrs.value;
  const sold = sum(d.sell_volume) * h;
  const bought = sum(d.buy_volume) * h;
  const sellRev = price ? d.sell_volume.reduce((s, v, i) => s + v * price[i], 0) * h : null;
  const buyCost = price ? d.buy_volume.reduce((s, v, i) => s + v * price[i], 0) * h : null;
  return {
    sold,
    bought,
    avgSell: sellRev !== null && sold > 0 ? sellRev / sold : null,
    net: sellRev !== null && buyCost !== null ? sellRev - buyCost : null,
  };
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <Panel
      v-for="market in markets"
      :key="market.name"
      :title="market.name"
      :description="market.stage_fixed ? 'stage_fixed — one trade schedule shared by all scenarios' : 'Trades may differ per scenario'"
    >
      <template v-if="stats(market)" #actions>
        <dl class="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
          <div><dt class="inline">Sold </dt><dd class="inline font-mono text-default">{{ fmtMWh(stats(market)!.sold) }}</dd></div>
          <div><dt class="inline">Bought </dt><dd class="inline font-mono text-default">{{ fmtMWh(stats(market)!.bought) }}</dd></div>
          <div v-if="stats(market)!.avgSell !== null"><dt class="inline">Avg sell price </dt><dd class="inline font-mono text-default">{{ fmtPrice(stats(market)!.avgSell) }}</dd></div>
          <div v-if="stats(market)!.net !== null"><dt class="inline">Net revenue </dt><dd class="inline font-mono text-default">{{ fmtMoneyFull(stats(market)!.net) }}</dd></div>
        </dl>
      </template>
      <VChart :option="option(market)" autoresize style="height: 240px" />
      <p class="mt-1 text-xs text-dimmed">Purchases above zero, sales below zero.</p>
    </Panel>
    <EmptyState v-if="markets.length === 0" icon="i-lucide-trending-up" title="No market in this portfolio" />
  </div>
</template>
