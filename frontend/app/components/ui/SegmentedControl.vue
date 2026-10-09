<script setup lang="ts">
// Accessible single-choice control (native radios: arrow keys + focus handled by the browser).
export interface SegmentItem<T extends string | number> {
  value: T;
  label: string;
  count?: number;
  hint?: string;
  disabled?: boolean;
}

const props = defineProps<{ items: SegmentItem<any>[]; label: string; size?: "sm" | "md" }>();
const model = defineModel<any>({ required: true });
const name = useId();
</script>

<template>
  <div role="radiogroup" :aria-label="label" class="inline-flex flex-wrap gap-0.5 rounded-md bg-elevated p-0.5">
    <label
      v-for="item in props.items"
      :key="String(item.value)"
      class="relative flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded px-2.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary"
      :class="[
        size === 'md' ? 'h-8' : 'h-7',
        model === item.value ? 'bg-default text-highlighted shadow-xs' : 'text-muted hover:text-default',
        item.disabled ? 'cursor-not-allowed opacity-50' : '',
      ]"
      :title="item.hint"
    >
      <input v-model="model" type="radio" :name="name" :value="item.value" :disabled="item.disabled" class="sr-only" />
      <span>{{ item.label }}</span>
      <span v-if="item.count !== undefined" class="text-xs text-dimmed">{{ item.count }}</span>
    </label>
  </div>
</template>
