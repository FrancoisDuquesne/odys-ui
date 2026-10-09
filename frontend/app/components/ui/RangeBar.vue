<script setup lang="ts">
// Min → max range with the expected value marked, e.g. profit across scenarios.
const props = defineProps<{
  min: number;
  max: number;
  expected: number;
  /** Optional tail-risk marker (e.g. CVaR). */
  tail?: number | null;
  format: (v: number) => string;
}>();

const span = computed(() => props.max - props.min);
const pos = (v: number) => (span.value > 0 ? Math.min(100, Math.max(0, ((v - props.min) / span.value) * 100)) : 50);
// A zero crossing is the most informative landmark for profit.
const zero = computed(() => (props.min < 0 && props.max > 0 ? pos(0) : null));
</script>

<template>
  <div class="mt-2 flex flex-col gap-1.5">
    <div class="relative h-1.5 rounded-full bg-elevated">
      <div class="absolute inset-y-0 rounded-full bg-accented" :style="{ left: '0%', right: '0%' }" />
      <div v-if="zero !== null" class="absolute -top-0.5 h-2.5 w-px bg-muted" :style="{ left: `${zero}%` }" title="Break-even" />
      <div
        v-if="tail != null"
        class="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-error"
        :style="{ left: `${pos(tail)}%` }"
        :title="`CVaR ${format(tail)}`"
      />
      <div
        class="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow dark:border-neutral-900"
        :style="{ left: `${pos(expected)}%` }"
        :title="`Expected ${format(expected)}`"
      />
    </div>
    <div class="flex justify-between font-mono text-xs text-muted">
      <span title="Worst scenario">{{ format(min) }}</span>
      <span title="Best scenario">{{ format(max) }}</span>
    </div>
  </div>
</template>
