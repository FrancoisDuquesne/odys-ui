<script setup lang="ts">
// A radio-style card for picking one thing out of several. The whole card is
// the select target (stretched button); the version menu sits above it so the
// two interactive controls never nest.
interface VersionOption { id: number; version: number }

const props = defineProps<{
  title: string;
  active: boolean;
  /** Saved versions of this item, oldest first. */
  versions: VersionOption[];
  /** Version currently shown on the card. */
  versionId: number;
  subtitle?: string;
}>();
const emit = defineEmits<{ select: []; "update:versionId": [id: number] }>();

const items = computed(() => props.versions.map((v) => ({ label: `v${v.version}${v.id === props.versions.at(-1)?.id ? " · latest" : ""}`, value: v.id })));
const current = computed(() => props.versions.find((v) => v.id === props.versionId));
</script>

<template>
  <div
    class="group relative flex min-w-0 flex-col gap-3 rounded-lg border bg-default p-4 transition-colors"
    :class="active ? 'border-primary ring-1 ring-primary' : 'border-default hover:border-accented'"
  >
    <button
      type="button"
      role="radio"
      :aria-checked="active"
      :aria-label="`${title}${current ? `, version ${current.version}` : ''}`"
      class="absolute inset-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      @click="emit('select')"
    />
    <header class="pointer-events-none flex items-start gap-2">
      <span
        class="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border"
        :class="active ? 'border-primary bg-primary text-inverted' : 'border-accented'"
        aria-hidden="true"
      >
        <UIcon v-if="active" name="i-lucide-check" class="size-3" />
      </span>
      <div class="flex min-w-0 flex-1 flex-col">
        <h3 class="truncate text-sm font-semibold text-highlighted">{{ title }}</h3>
        <p v-if="subtitle" class="truncate text-xs text-muted">{{ subtitle }}</p>
      </div>
      <div class="pointer-events-auto relative">
        <USelectMenu
          v-if="versions.length > 1"
          :model-value="versionId"
          :items="items"
          value-key="value"
          size="xs"
          variant="ghost"
          color="neutral"
          class="w-28"
          :search-input="false"
          :aria-label="`Version of ${title}`"
          @update:model-value="(id: number) => emit('update:versionId', id)"
        />
        <UBadge v-else-if="current" color="neutral" variant="subtle" size="sm" :label="`v${current.version}`" />
      </div>
    </header>
    <div class="pointer-events-none flex flex-col gap-2"><slot /></div>
    <footer v-if="$slots.footer" class="relative flex items-center gap-2 border-t border-muted pt-2 text-xs text-muted"><slot name="footer" /></footer>
  </div>
</template>
