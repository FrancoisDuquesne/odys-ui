<script setup lang="ts">
// Full-screen intro shown once per page load: the logo builds itself, then the overlay fades away.
const visible = useState("splash-visible", () => true);
const leaving = ref(false);

onMounted(() => {
  setTimeout(() => (leaving.value = true), 2100);
  setTimeout(() => (visible.value = false), 2600);
});
</script>

<template>
  <div
    v-if="visible"
    class="splash fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-default transition-opacity duration-500"
    :class="leaving ? 'pointer-events-none opacity-0' : 'opacity-100'"
    aria-hidden="true"
  >
    <OdysLogo animated class="size-28" />
    <span class="splash-word text-2xl font-semibold tracking-tight text-highlighted">odys</span>
  </div>
</template>

<style scoped>
.splash-word {
  opacity: 0;
  animation: word-in 0.6s ease-out 1.3s forwards;
}
@keyframes word-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .splash-word { animation: none; opacity: 1; }
}
</style>
