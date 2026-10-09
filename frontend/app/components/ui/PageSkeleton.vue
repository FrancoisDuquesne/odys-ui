<script setup lang="ts">
withDefaults(defineProps<{ rows?: number }>(), { rows: 3 });
</script>

<template>
  <div class="flex flex-col gap-4" role="status" aria-label="Loading">
    <USkeleton class="h-20 w-full" />
    <USkeleton v-for="i in rows" :key="i" class="h-12 w-full" />
  </div>
</template>
