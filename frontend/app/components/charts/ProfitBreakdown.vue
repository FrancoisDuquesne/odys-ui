<script setup lang="ts">
import type { ScenarioResults } from "~/types";

const props = defineProps<{ scenario: ScenarioResults }>();

const maxAbs = computed(() => Math.max(1, ...props.scenario.profit_breakdown.rows.map((r) => Math.abs(r.value))));
const pricedRows = computed(() => props.scenario.profit_breakdown.rows.filter((r) => r.priced));
const memoRows = computed(() => props.scenario.profit_breakdown.rows.filter((r) => !r.priced));
const tone = (v: number) => (v >= 0 ? "text-success" : "text-error");
</script>

<template>
  <Panel title="Profit breakdown" description="Revenue and cost components of the solver objective for this scenario">
    <ul class="flex flex-col">
      <li v-for="row in pricedRows" :key="row.label" class="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-muted py-2.5 text-sm">
        <div class="flex flex-col gap-1">
          <span class="text-highlighted">{{ row.label }}</span>
          <span class="font-mono text-xs text-dimmed">{{ row.formula }}</span>
          <div class="h-1.5 w-full max-w-64 rounded-full bg-elevated" role="presentation">
            <div class="h-full rounded-full" :class="row.value >= 0 ? 'bg-success' : 'bg-error'" :style="{ width: `${(Math.abs(row.value) / maxAbs) * 100}%` }" />
          </div>
        </div>
        <span class="font-mono font-medium" :class="tone(row.value)">{{ fmtMoneyFull(row.value, { plus: true }) }}</span>
      </li>
    </ul>

    <div class="grid grid-cols-[1fr_auto] items-center gap-3 pt-3 text-sm font-semibold">
      <span class="text-highlighted">Profit = revenue − costs</span>
      <span class="font-mono" :class="tone(scenario.profit_breakdown.total)">{{ fmtMoneyFull(scenario.profit_breakdown.total, { plus: true }) }}</span>
    </div>

    <div v-if="memoRows.length" class="mt-4 flex flex-col gap-1 border-t border-dashed border-default pt-3">
      <span class="text-xs text-dimmed">Informational only — not priced by the solver (odys 0.2.0 does not include these in the objective):</span>
      <div v-for="row in memoRows" :key="row.label" class="flex items-center justify-between text-xs text-muted">
        <span>{{ row.label }}</span>
        <span class="font-mono">{{ fmtMoneyFull(row.value, { plus: true }) }}</span>
      </div>
    </div>
  </Panel>
</template>
