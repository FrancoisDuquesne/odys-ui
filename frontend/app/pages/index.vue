<script setup lang="ts">
const { ensureLoaded, projects, error } = useProjectsState();
await ensureLoaded();

// On failure the layout renders the error state; stay on this route so Retry works.
if (!error.value) {
  await navigateTo(projects.value.length > 0 ? `/p/${projects.value[0].id}/runs` : "/projects");
}
</script>

<template>
  <div />
</template>
