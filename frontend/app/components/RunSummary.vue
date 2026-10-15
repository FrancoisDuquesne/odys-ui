<script setup lang="ts">
import type { Run } from "~/types";
import type { Verdict } from "~/utils/export";

// Clean one-page summary, visible only when printing (Export > Download summary).
const props = defineProps<{
  run: Run;
  verdict: Verdict;
  portfolioLabel: string;
  scenarioLabel: string;
  kpis: { label: string; value: string; sub?: string }[];
  scenarioName: string;
}>();

const rows = computed(() => props.run.results?.by_scenario[props.scenarioName]?.profit_breakdown.rows.filter((r) => r.priced) ?? []);
const total = computed(() => props.run.results?.by_scenario[props.scenarioName]?.profit_breakdown.total ?? 0);
</script>

<template>
  <div id="print-summary" class="hidden text-black">
    <p class="text-xs uppercase tracking-wide">odys · Run {{ run.display_id }} · {{ fmtDateTime(run.created_at) }}</p>
    <h1 class="mt-1 text-2xl font-semibold">{{ verdict.headline }}</h1>
    <p class="mt-1 text-base">{{ verdict.sentence }}</p>
    <p class="mt-2 text-sm">Portfolio: {{ portfolioLabel }} · Scenarios: {{ scenarioLabel }}</p>

    <div class="mt-5 grid grid-cols-3 gap-3">
      <div v-for="k in kpis" :key="k.label" class="rounded border border-neutral-400 p-3">
        <div class="text-xs">{{ k.label }}</div>
        <div class="font-mono text-xl font-semibold">{{ k.value }}</div>
        <div v-if="k.sub" class="text-xs">{{ k.sub }}</div>
      </div>
    </div>

    <h2 class="mt-6 text-base font-semibold">Profit breakdown<span v-if="run.results?.stochastic"> ({{ scenarioName }} scenario)</span></h2>
    <table class="mt-2 w-full text-sm">
      <tbody>
        <tr v-for="r in rows" :key="r.label" class="border-b border-neutral-300">
          <td class="py-1.5">{{ r.label }}</td>
          <td class="py-1.5 text-right font-mono">{{ fmtMoneyFull(r.value, { plus: true }) }}</td>
        </tr>
        <tr class="font-semibold">
          <td class="pt-2">{{ total < 0 ? "Net cost" : "Net profit" }}</td>
          <td class="pt-2 text-right font-mono">{{ fmtMoneyFull(total, { plus: true }) }}</td>
        </tr>
      </tbody>
    </table>
    <p class="mt-6 text-xs">Solver {{ run.solver.solver_name.toUpperCase() }} · {{ fmtDuration(run.solve_time_seconds) }} · {{ run.status }}</p>
  </div>
</template>

<style>
@media print {
  body * { visibility: hidden !important; }
  #print-summary, #print-summary * { visibility: visible !important; }
  #print-summary { display: block !important; position: absolute; left: 0; top: 0; width: 100%; padding: 12mm; background: white; }
  html, body { background: white !important; height: auto !important; overflow: visible !important; }
  @page { margin: 8mm; }
}
</style>
