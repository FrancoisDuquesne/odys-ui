<script setup lang="ts">
withDefaults(defineProps<{ title?: string; description?: string; flush?: boolean }>(), { flush: false });
</script>

<template>
  <section class="rounded-lg border border-default bg-default">
    <header v-if="title || $slots.actions" class="flex flex-wrap items-start gap-x-4 gap-y-1 border-b border-muted px-4 py-3">
      <div class="flex min-w-0 flex-col gap-0.5">
        <h2 class="text-sm font-semibold text-highlighted">{{ title }}</h2>
        <p v-if="description" class="text-xs text-muted">{{ description }}</p>
      </div>
      <div class="ml-auto flex items-center gap-2"><slot name="actions" /></div>
    </header>
    <div :class="flush ? '' : 'p-4'"><slot /></div>
    <footer v-if="$slots.footer" class="border-t border-muted px-4 py-2.5 text-xs text-muted"><slot name="footer" /></footer>
  </section>
</template>
