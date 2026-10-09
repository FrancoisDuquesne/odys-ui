<script setup lang="ts">
export interface KpiDelta {
  text: string;
  tone?: "good" | "bad" | "neutral";
  icon?: string;
}

withDefaults(
  defineProps<{
    label: string;
    value: string;
    sub?: string;
    /** Longer explanation, shown in a tooltip next to the label. */
    hint?: string;
    tone?: "default" | "good" | "bad";
    delta?: KpiDelta;
    icon?: string;
    size?: "hero" | "default";
  }>(),
  { tone: "default", size: "default" },
);

const toneClass = { default: "text-highlighted", good: "text-success", bad: "text-error" } as const;
const deltaClass = { good: "text-success", bad: "text-error", neutral: "text-muted" } as const;
</script>

<template>
  <div class="flex min-w-0 flex-col gap-1.5 rounded-lg border border-default bg-default" :class="size === 'hero' ? 'p-5' : 'px-4 py-3'">
    <div class="flex items-center gap-1.5 text-xs text-muted">
      <UIcon v-if="icon" :name="icon" class="size-3.5 shrink-0" />
      <span class="truncate">{{ label }}</span>
      <UTooltip v-if="hint" :text="hint">
        <UIcon name="i-lucide-info" class="size-3.5 shrink-0 cursor-help text-dimmed" />
      </UTooltip>
    </div>
    <div class="font-mono font-semibold tabular-nums" :class="[toneClass[tone], size === 'hero' ? 'text-4xl' : 'text-xl']">{{ value }}</div>
    <div v-if="delta" class="flex items-center gap-1 text-xs font-medium" :class="deltaClass[delta.tone ?? 'neutral']">
      <UIcon v-if="delta.icon" :name="delta.icon" class="size-3.5" />
      <span>{{ delta.text }}</span>
    </div>
    <p v-if="sub" class="truncate text-xs text-dimmed" :title="sub">{{ sub }}</p>
    <slot />
  </div>
</template>
