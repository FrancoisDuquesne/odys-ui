<script setup lang="ts">
const props = defineProps<{ status: string; size?: "sm" | "md" }>();
const meta = computed(() => runStatus(props.status));
</script>

<template>
  <UBadge :color="meta.color" variant="subtle" :size="size ?? 'sm'" :icon="meta.icon" :label="meta.label" />
</template>
