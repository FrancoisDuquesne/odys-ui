<script setup lang="ts">
defineProps<{ title?: string; message?: string }>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <UAlert
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :title="title ?? 'Something went wrong'"
    :description="message ?? 'The request failed. Check that the backend is running and try again.'"
    :actions="[{ label: 'Retry', color: 'neutral', variant: 'outline', onClick: () => $emit('retry') }]"
  />
</template>
